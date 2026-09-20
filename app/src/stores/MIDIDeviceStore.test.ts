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

    expect(store.connectedOutputNames).toEqual(["midiseq out", "Synth"])
    store.setOutputName("all", "midiseq out")
    store.setOutputName(1, "Synth")
    expect(store.assignment.all).toBe(loop)
    expect(store.assignment.voices).toEqual([null, synth, null, null])
  })

  it("follows ports being unplugged and plugged back in", async () => {
    const access = fakeAccess([fakeOutput("a", "midiseq out")])
    const store = new MIDIDeviceStore(
      async () => access as unknown as MIDIAccess,
      memoryStorage(),
    )
    await store.requestMIDIAccess()
    store.setOutputName("all", "midiseq out")

    access.outputs.clear()
    access.onstatechange?.()
    expect(store.assignment.all).toBeNull()

    // a replugged port gets a new id but keeps its name
    const replugged = fakeOutput("c", "midiseq out")
    access.outputs.set("c", replugged)
    access.onstatechange?.()
    expect(store.assignment.all).toBe(replugged)
  })

  it("remembers the chosen port names", () => {
    const storage = memoryStorage()
    const first = new MIDIDeviceStore(null, storage)
    first.setOutputName(2, "Synth")

    const second = new MIDIDeviceStore(null, storage)
    expect(second.outputNames.voices[2]).toBe("Synth")
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

  it("resolves and remembers the input port and channel", async () => {
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
    expect(store.inputPort).toBeNull()

    store.setInputName("Keystation")
    store.setReceiveChannel(3)
    expect(store.inputPort).toBe(keyboard)

    const reopened = new MIDIDeviceStore(null, storage)
    expect(reopened.inputName).toBe("Keystation")
    expect(reopened.receiveChannel).toBe(3)
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
