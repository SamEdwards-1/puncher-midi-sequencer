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
    fetchSoundFont: async () => new ArrayBuffer(8),
    now: () => 1000,
  })
  await sound.load()
  return { sound, synth }
}

describe("SoundFontSynth", () => {
  it("loads a SoundFont and connects to the output", async () => {
    const { sound, synth } = await setup()
    expect(sound.isLoaded).toBe(true)
    expect(synth.connect).toHaveBeenCalled()
    expect(synth.soundBankManager.addSoundBank).toHaveBeenCalled()
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
