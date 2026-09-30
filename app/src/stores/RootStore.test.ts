import { createDefaultPatch } from "@midiseq/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AutoSaveService } from "../services/AutoSaveService"
import { OwnedTicker } from "../services/Ticker"
import { ManualTicker } from "../test/fakes"
import RootStore from "./RootStore"
import { SynthStore } from "./SynthStore"

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

// Counts what is still running, to see it come back down.
class FakeWorker {
  static live = 0
  onmessage: unknown = null
  onerror: unknown = null
  private ended = false

  constructor() {
    FakeWorker.live++
  }

  postMessage() {}

  terminate() {
    if (!this.ended) {
      this.ended = true
      FakeWorker.live--
    }
  }
}

class FakeAudioContext {
  static open = 0
  state: AudioContextState = "suspended"
  currentTime = 0
  destination = {}

  constructor() {
    FakeAudioContext.open++
  }

  async resume() {}

  async close() {
    if (this.state !== "closed") {
      this.state = "closed"
      FakeAudioContext.open--
    }
  }
}

const GESTURES = ["pointerdown", "keydown"]

describe("RootStore.dispose", () => {
  let gestureListeners: Set<unknown>
  let createObjectURL: typeof URL.createObjectURL
  let revokeObjectURL: typeof URL.revokeObjectURL

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWorker.live = 0
    FakeAudioContext.open = 0
    vi.stubGlobal("Worker", FakeWorker)
    vi.stubGlobal("AudioContext", FakeAudioContext)
    // the ticker's worker is made from a blob, which jsdom can't
    createObjectURL = URL.createObjectURL
    revokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = () => "blob:ticker"
    URL.revokeObjectURL = () => {}

    gestureListeners = new Set()
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (GESTURES.includes(type)) {
          gestureListeners.add(listener)
        }
        add(type, listener, options)
      },
    )
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (type, listener, options) => {
        if (GESTURES.includes(type)) {
          gestureListeners.delete(listener)
        }
        remove(type, listener, options)
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
  })

  // A store started as the app starts it, with the MIDI keyboard it was
  // last listening to, playing, and the built-in sound's audio made.
  const startStore = async () => {
    const keyboard = {
      id: "k",
      name: "Keystation",
      state: "connected",
      onmidimessage: null as unknown,
    }
    const access = {
      outputs: new Map(),
      inputs: new Map([["k", keyboard]]),
      onstatechange: null as unknown,
    }
    const storage = memoryStorage()
    storage.setItem("midiseq.midiInput", JSON.stringify(["Keystation"]))
    const rootStore = new RootStore({
      requestMIDIAccess: async () => access as unknown as MIDIAccess,
      storage,
    })
    rootStore.init()
    await vi.waitFor(() =>
      expect(rootStore.midiDeviceStore.hasAccess).toBe(true),
    )
    rootStore.player.play()
    await rootStore.synthStore.use(-1, () =>
      Promise.reject(new Error("offline")),
    )
    return { rootStore, keyboard, access }
  }

  it("brings listeners, timers, workers and audio back to where they were", async () => {
    const timers = vi.getTimerCount()

    for (let round = 0; round < 3; round++) {
      const { rootStore, keyboard, access } = await startStore()
      expect(gestureListeners.size).toBeGreaterThan(0)
      expect(vi.getTimerCount()).toBeGreaterThan(timers)
      expect(FakeWorker.live).toBeGreaterThan(0)
      expect(FakeAudioContext.open).toBe(1)
      expect(keyboard.onmidimessage).not.toBeNull()
      expect(access.onstatechange).not.toBeNull()

      rootStore.dispose()

      expect(gestureListeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(timers)
      expect(FakeWorker.live).toBe(0)
      await Promise.resolve()
      expect(FakeAudioContext.open).toBe(0)
      expect(keyboard.onmidimessage).toBeNull()
      expect(access.onstatechange).toBeNull()
      expect(rootStore.player.isPlaying).toBe(false)
    }
  })

  it("is safe to call twice", async () => {
    const { rootStore } = await startStore()
    rootStore.dispose()
    rootStore.dispose()
    expect(FakeWorker.live).toBe(0)
    expect(FakeAudioContext.open).toBe(0)
  })

  it("stops what the store does with what it was handed, and leaves it working", async () => {
    const context = new FakeAudioContext()
    const synthStore = new SynthStore(() => context as unknown as AudioContext)
    await synthStore.use(-1, () => Promise.reject(new Error("offline")))
    const ticker = Object.assign(new ManualTicker(), {
      dispose: vi.fn(),
    }) satisfies OwnedTicker
    const storage = memoryStorage()
    const autoSave = new AutoSaveService(
      () => createDefaultPatch(),
      () => false,
      storage,
    )
    const rootStore = new RootStore({
      requestMIDIAccess: null,
      storage,
      ticker,
      synthStore,
      autoSave,
    })
    rootStore.init()
    rootStore.player.play()
    expect(ticker.isRunning).toBe(true)

    rootStore.dispose()

    // stopped, since the store started them
    expect(ticker.isRunning).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(gestureListeners.size).toBe(0)
    // but not ended, since the store didn't make them
    expect(ticker.dispose).not.toHaveBeenCalled()
    expect(context.state).not.toBe("closed")
    ticker.start(() => {})
    expect(ticker.isRunning).toBe(true)
  })
})
