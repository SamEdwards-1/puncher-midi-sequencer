import { describe, expect, it, vi } from "vitest"
import type { SynthLike } from "../services/SoundFontSynth"
import { SynthStore } from "./SynthStore"

const fakeSynth = () =>
  ({
    connect: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    controllerChange: vi.fn(),
    programChange: vi.fn(),
    isReady: Promise.resolve(),
    soundBankManager: { addSoundBank: vi.fn(async () => undefined) },
  }) as unknown as SynthLike

const fakeContext = (state: AudioContextState = "suspended") => {
  const context = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      context.state = "running"
    }),
    close: vi.fn(async () => {
      context.state = "closed"
    }),
  }
  return context
}

// bytes that arrive when the test says so
const deferred = () => {
  let resolve: (data: ArrayBuffer) => void = () => {}
  const promise = new Promise<ArrayBuffer>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const setup = () => {
  const context = fakeContext()
  const synth = fakeSynth()
  const createSynth = vi.fn(async () => synth)
  const store = new SynthStore(() => context as unknown as AudioContext, {
    createSynth,
  })
  return { store, context, synth, createSynth }
}

describe("SynthStore", () => {
  it("loads a SoundFont before the audio has been allowed to start", async () => {
    const { store, context } = setup()
    await store.use(-1, async () => new ArrayBuffer(8))

    expect(store.state).toBe("ready")
    expect(store.fontId).toBe(-1)
    expect(store.synth?.isLoaded).toBe(true)
    expect(context.resume).not.toHaveBeenCalled()
  })

  it("starts the audio on the first click or key press", async () => {
    const { store, context } = setup()
    await store.use(-1, async () => new ArrayBuffer(8))
    const target = new EventTarget()
    const stop = store.resumeOnGesture(target)

    target.dispatchEvent(new Event("pointerdown"))
    expect(context.resume).toHaveBeenCalledTimes(1)

    // running, so later presses leave it be
    await Promise.resolve()
    target.dispatchEvent(new Event("keydown"))
    expect(context.resume).toHaveBeenCalledTimes(1)
    stop()
  })

  it("leaves the audio waiting when asked to start outside a gesture", async () => {
    const { store, context } = setup()
    await store.use(-1, async () => new ArrayBuffer(8))
    const userActivation = { isActive: false }
    vi.stubGlobal("navigator", { userActivation })

    store.resume()
    expect(context.resume).not.toHaveBeenCalled()

    userActivation.isActive = true
    store.resume()
    expect(context.resume).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it("swaps fonts in the one synth", async () => {
    const { store, synth, createSynth } = setup()
    await store.use(-1, async () => new ArrayBuffer(8))
    const first = store.synth
    await store.use(3, async () => new ArrayBuffer(16))

    expect(createSynth).toHaveBeenCalledTimes(1)
    expect(store.synth).toBe(first)
    expect(store.fontId).toBe(3)
    expect(synth.soundBankManager.addSoundBank).toHaveBeenCalledTimes(2)
  })

  it("loads only the last font asked for", async () => {
    const { store, synth } = setup()
    const slow = deferred()
    const first = store.use(1, () => slow.promise)
    const second = store.use(2, async () => new ArrayBuffer(16))
    await second
    slow.resolve(new ArrayBuffer(8))
    await first

    expect(store.fontId).toBe(2)
    expect(store.state).toBe("ready")
    expect(synth.soundBankManager.addSoundBank).toHaveBeenCalledTimes(1)
  })

  it("closes the audio it made when disposed, once", async () => {
    const { store, context } = setup()
    await store.use(-1, async () => new ArrayBuffer(8))
    store.dispose()
    store.dispose()
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it("drops a font still loading when disposed, and loads none after", async () => {
    const { store, context, synth } = setup()
    const slow = deferred()
    const loading = store.use(1, () => slow.promise)
    store.dispose()
    slow.resolve(new ArrayBuffer(8))
    await loading
    await store.use(2, async () => new ArrayBuffer(8))

    expect(store.synth).toBeNull()
    expect(synth.soundBankManager.addSoundBank).not.toHaveBeenCalled()
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it("says why a font didn't load", async () => {
    const { store } = setup()
    await store.use(-1, async () => {
      throw new Error("Couldn't fetch the SoundFont (503)")
    })
    expect(store.state).toBe("error")
    expect(store.error).toBe("Couldn't fetch the SoundFont (503)")
  })
})
