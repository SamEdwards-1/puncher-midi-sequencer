import { describe, expect, it, vi } from "vitest"
import { SoundFontSynth, SynthLike } from "./SoundFontSynth"

const fakeSynth = () =>
  ({
    connect: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    controllerChange: vi.fn(),
    programChange: vi.fn(),
    isReady: Promise.resolve(),
    soundBankManager: { addSoundBank: vi.fn() },
  }) as unknown as SynthLike & {
    noteOn: ReturnType<typeof vi.fn>
    noteOff: ReturnType<typeof vi.fn>
    controllerChange: ReturnType<typeof vi.fn>
    programChange: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
  }

const setup = async (currentTime = 10) => {
  const synth = fakeSynth()
  const context = {
    currentTime,
    destination: {} as AudioNode,
  } as unknown as AudioContext
  const sound = new SoundFontSynth(context, {
    createSynth: async () => synth,
    now: () => 1000,
  })
  await sound.loadSoundFont(new ArrayBuffer(8))
  return { sound, synth }
}

describe("SoundFontSynth", () => {
  it("loads a SoundFont and connects to the output", async () => {
    const { sound, synth } = await setup()
    expect(sound.isLoaded).toBe(true)
    expect(synth.connect).toHaveBeenCalled()
    expect(synth.soundBankManager.addSoundBank).toHaveBeenCalled()
  })

  it("swaps one SoundFont for another in the same synth", async () => {
    const created = vi.fn(async () => fakeSynth())
    const context = { destination: {} } as unknown as AudioContext
    const sound = new SoundFontSynth(context, { createSynth: created })

    await sound.loadSoundFont(new ArrayBuffer(8))
    await sound.loadSoundFont(new ArrayBuffer(16))

    expect(created).toHaveBeenCalledTimes(1)
    const synth = await created.mock.results[0].value
    expect(synth.soundBankManager.addSoundBank).toHaveBeenCalledTimes(2)
    // the same bank replaced, rather than a second one stacked on it
    expect(synth.soundBankManager.addSoundBank).toHaveBeenLastCalledWith(
      expect.any(ArrayBuffer),
      "main",
    )
  })

  it("plays the MIDI bytes it is sent", async () => {
    const { sound, synth } = await setup()

    sound.send([0x92, 60, 100])
    expect(synth.noteOn).toHaveBeenCalledWith(2, 60, 100, { time: 10 })

    sound.send([0x82, 60, 0])
    expect(synth.noteOff).toHaveBeenCalledWith(2, 60, { time: 10 })

    sound.send([0xb0, 74, 30])
    expect(synth.controllerChange).toHaveBeenCalledWith(0, 74, 30, { time: 10 })
  })

  it("treats a note on at velocity 0 as a note off", async () => {
    const { sound, synth } = await setup()
    sound.send([0x90, 60, 0])

    expect(synth.noteOn).not.toHaveBeenCalled()
    expect(synth.noteOff).toHaveBeenCalledWith(0, 60, { time: 10 })
  })

  it("turns the player's timestamps into audio time", async () => {
    const { sound, synth } = await setup(10)

    // 250 ms past the player's clock lands a quarter-second ahead
    sound.send([0x90, 60, 100], 1250)
    expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 100, { time: 10.25 })

    // anything already due plays now rather than in the past
    sound.send([0x90, 62, 100], 500)
    expect(synth.noteOn).toHaveBeenLastCalledWith(0, 62, 100, { time: 10 })
  })

  it("uses the output clock so buffered audio reaches the playhead on time", async () => {
    const synth = fakeSynth()
    const context = {
      currentTime: 10,
      destination: {} as AudioNode,
      getOutputTimestamp: () => ({
        contextTime: 9.9,
        performanceTime: 1000,
      }),
    } as unknown as AudioContext
    const sound = new SoundFontSynth(context, {
      createSynth: async () => synth,
      now: () => 1000,
    })
    await sound.loadSoundFont(new ArrayBuffer(8))

    // The next renderable sample reaches the output in 100 ms. Leave another
    // 25 ms for the worklet message and map 1250 ms onto its audio clock.
    expect(sound.minimumLeadMs(1000)).toBeCloseTo(125)
    sound.send([0x90, 60, 100], 1250)
    expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 100, { time: 10.15 })
  })

  it("uses reported latency until the output clock has a sample", async () => {
    const synth = fakeSynth()
    const context = {
      currentTime: 10,
      baseLatency: 0.02,
      outputLatency: 0.08,
      destination: {} as AudioNode,
      getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
    } as unknown as AudioContext
    const sound = new SoundFontSynth(context, {
      createSynth: async () => synth,
      now: () => 1000,
    })
    await sound.loadSoundFont(new ArrayBuffer(8))

    expect(sound.minimumLeadMs(1000)).toBeCloseTo(125)
    sound.send([0x90, 60, 100], 1250)
    expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 100, { time: 10.15 })
  })

  it("sets a voice's instrument by channel", async () => {
    const { sound, synth } = await setup()
    sound.setProgram(3, 42)
    expect(synth.programChange).toHaveBeenCalledWith(2, 42)
  })

  it("stays quiet until it has loaded", () => {
    const context = { currentTime: 0 } as unknown as AudioContext
    const sound = new SoundFontSynth(context)
    expect(() => sound.send([0x90, 60, 100])).not.toThrow()
    expect(sound.isLoaded).toBe(false)
  })
})
