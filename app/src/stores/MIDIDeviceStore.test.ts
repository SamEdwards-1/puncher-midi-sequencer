import { describe, expect, it, vi } from "vitest"
import { MIDIDeviceStore } from "./MIDIDeviceStore"

const fakeOutput = (id: string, name: string, state = "connected") =>
  ({ id, name, state, send: vi.fn(), clear: vi.fn() }) as unknown as MIDIOutput

const fakeAccess = (outputs: MIDIOutput[]) => {
  const access = {
    outputs: new Map(outputs.map((output) => [output.id, output])),
    inputs: new Map(),
    onstatechange: null as (() => void) | null,
  }
  return access
}

const memoryStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

describe("MIDIDeviceStore", () => {
  it("lists ports and resolves the chosen outputs by name", async () => {
    const loop = fakeOutput("a", "midiseq out")
    const synth = fakeOutput("b", "Synth")
    const access = fakeAccess([loop, synth])
    const store = new MIDIDeviceStore(
      async () => access as unknown as MIDIAccess,
      memoryStorage(),
    )
    await store.requestMIDIAccess()

    // the built-in sound is offered alongside the ports
    expect(store.connectedOutputNames).toEqual([
      "Built-in synth",
      "midiseq out",
      "Synth",
    ])
    store.toggleOutput("midiseq out", true)
    store.toggleOutput("Synth", true)
    store.setVoiceOutput(1, "Synth")
    // every ticked port takes the whole sequence
    expect(store.assignment.all).toEqual([loop, synth])
    expect(store.assignment.voices).toEqual([null, synth, null, null])

    store.toggleOutput("Synth", false)
    expect(store.assignment.all).toEqual([loop])
  })

  it("follows ports being unplugged and plugged back in", async () => {
    const access = fakeAccess([fakeOutput("a", "midiseq out")])
    const store = new MIDIDeviceStore(
      async () => access as unknown as MIDIAccess,
      memoryStorage(),
    )
    await store.requestMIDIAccess()
    store.toggleOutput("midiseq out", true)

    access.outputs.clear()
    access.onstatechange?.()
    expect(store.assignment.all).toEqual([null])

    // a replugged port gets a new id but keeps its name
    const replugged = fakeOutput("c", "midiseq out")
    access.outputs.set("c", replugged)
    access.onstatechange?.()
    expect(store.assignment.all).toEqual([replugged])
  })

  it("remembers the chosen port names", () => {
    const storage = memoryStorage()
    const first = new MIDIDeviceStore(null, storage)
    first.setVoiceOutput(2, "Synth")
    first.toggleOutput("midiseq out", true)

    const second = new MIDIDeviceStore(null, storage)
    expect(second.outputNames.voices[2]).toBe("Synth")
    expect(second.outputNames.all).toEqual(["midiseq out"])
  })

  it("asks for access on startup unless the browser already refused", async () => {
    const permission = (state: string) => async () =>
      ({ state, onchange: null }) as unknown as PermissionStatus

    let prompted = 0
    const promptStore = new MIDIDeviceStore(
      async () => {
        prompted++
        return fakeAccess([
          fakeOutput("a", "midiseq out"),
        ]) as unknown as MIDIAccess
      },
      memoryStorage(),
      permission("prompt"),
    )
    await promptStore.connectOnStart()
    expect(prompted).toBe(1)
    expect(promptStore.hasAccess).toBe(true)

    let denied = 0
    const deniedStore = new MIDIDeviceStore(
      async () => {
        denied++
        return fakeAccess([]) as unknown as MIDIAccess
      },
      memoryStorage(),
      permission("denied"),
    )
    await deniedStore.connectOnStart()
    // asking again would do nothing; the menu offers a button instead
    expect(denied).toBe(0)
    expect(deniedStore.permission).toBe("denied")
  })

  it("resolves and remembers the chosen inputs", async () => {
    const keyboard = { id: "k", name: "Keystation", state: "connected" }
    const access = {
      outputs: new Map(),
      inputs: new Map([["k", keyboard]]),
      onstatechange: null as (() => void) | null,
    }
    const storage = memoryStorage()
    const store = new MIDIDeviceStore(
      async () => access as unknown as MIDIAccess,
      storage,
    )
    await store.requestMIDIAccess()

    expect(store.connectedInputNames).toEqual(["Keystation"])
    expect(store.inputPorts).toEqual([])

    store.toggleInput("Keystation", true)
    store.setFilter({ channels: [3], transpose: 12 })
    expect(store.inputPorts).toEqual([keyboard])

    const reopened = new MIDIDeviceStore(null, storage)
    expect(reopened.inputNames).toEqual(["Keystation"])
    expect(reopened.filter.channels).toEqual([3])
    expect(reopened.filter.transpose).toBe(12)
  })

  it("reads what older versions saved", () => {
    const storage = memoryStorage()
    // one input name beside a receive channel, and one output for everything
    storage.setItem(
      "midiseq.midiInput",
      JSON.stringify({ name: "Keystation", channel: 3 }),
    )
    storage.setItem(
      "midiseq.midiOutputs",
      JSON.stringify({
        all: "midiseq out",
        voices: [null, "Synth", null, null],
      }),
    )

    const store = new MIDIDeviceStore(null, storage)
    expect(store.inputNames).toEqual(["Keystation"])
    expect(store.outputNames.all).toEqual(["midiseq out"])
    expect(store.outputNames.voices[1]).toBe("Synth")
    // the old receive channel is not carried over; the filter starts open
    expect(store.filter.channels).toHaveLength(16)
  })

  it("reports when Web MIDI is missing or refused", async () => {
    expect(new MIDIDeviceStore(null, memoryStorage()).isSupported).toBe(false)

    const refused = new MIDIDeviceStore(async () => {
      throw new Error("denied")
    }, memoryStorage())
    await refused.requestMIDIAccess()
    expect(refused.requestError?.message).toBe("denied")
    expect(refused.isLoading).toBe(false)
  })
})
