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

  it("reconnects on startup only when permission was already granted", async () => {
    const permission = (state: string) => async () =>
      ({ state, onchange: null }) as unknown as PermissionStatus

    let granted = 0
    const grantedStore = new MIDIDeviceStore(
      async () => {
        granted++
        return fakeAccess([
          fakeOutput("a", "midiseq out"),
        ]) as unknown as MIDIAccess
      },
      memoryStorage(),
      permission("granted"),
    )
    await grantedStore.connectIfAllowed()
    expect(granted).toBe(1)
    expect(grantedStore.hasAccess).toBe(true)

    let prompted = 0
    const promptStore = new MIDIDeviceStore(
      async () => {
        prompted++
        return fakeAccess([]) as unknown as MIDIAccess
      },
      memoryStorage(),
      permission("prompt"),
    )
    await promptStore.connectIfAllowed()
    // waits for a click so the browser can show its prompt
    expect(prompted).toBe(0)
    expect(promptStore.hasAccess).toBe(false)
    expect(promptStore.permission).toBe("prompt")
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
