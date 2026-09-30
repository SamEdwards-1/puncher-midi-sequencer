import { createDefaultPatch, PatchJSON } from "@midiseq/core"
import { describe, expect, it, vi } from "vitest"
import type {
  AudioRenderProgress,
  AudioRenderRequest,
  AudioRenderSettings,
} from "./audioExport"
import { encodeMp3 } from "./encodeMp3"
import { audioTimeline, encodeWav, normalize, renderAudio } from "./renderAudio"

// There is no SoundFont to play in a test, so the synth is a stand-in that
// plays a quiet tone whatever it is sent: the render around it is what is
// tested here.
vi.mock("spessasynth_core", () => ({
  MIDIController: {},
  SoundBankLoader: { fromArrayBuffer: () => ({}) },
  SpessaSynthProcessor: class {
    soundBankManager = { addSoundBank: () => {} }
    processorInitialized = Promise.resolve()
    setSystemParameter() {}
    noteOn() {}
    noteOff() {}
    controllerChange() {}
    programChange() {}
    process(
      left: Float32Array,
      right: Float32Array,
      at: number,
      count: number,
    ) {
      for (let index = at; index < at + count; index++) {
        left[index] = right[index] = Math.sin(index / 20) * 0.25
      }
    }
    destroySynthProcessor() {}
  },
}))

// two steps a quarter note each at 120, one note in each, voice 1 alone
const twoSteps = (): PatchJSON => {
  const patch = createDefaultPatch()
  patch.pace = "4th"
  patch.steps[0].notes = [60]
  patch.steps[1].notes = [64]
  return patch
}

const timing = { passes: 1, seed: 1, accentAmount: 0, modulationCCs: true }

// a second of a quiet sine, on both sides
const tone = (sampleRate: number, level = 0.25) => {
  const samples = Float32Array.from(
    { length: sampleRate },
    (_, index) => Math.sin((index / sampleRate) * 2 * Math.PI * 440) * level,
  )
  return [samples, samples.slice()]
}

const text = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.slice(from, from + length))

describe("the audio timeline", () => {
  it("sets each voice's instrument first, on its channel", () => {
    const patch = twoSteps()
    patch.voices[0].program = 33
    const { messages } = audioTimeline(patch, timing)
    const programs = messages.filter(({ data }) => (data[0] & 0xf0) === 0xc0)
    expect(programs[0]).toEqual({
      time: 0,
      data: [0xc0 | (patch.voices[0].channel - 1), 33],
    })
    expect(messages.slice(0, patch.voices.length)).toEqual(programs)
  })

  it("times the notes in seconds at the patch's tempo", () => {
    const { messages, length } = audioTimeline(twoSteps(), timing)
    const ons = messages.filter(
      ({ data }) => (data[0] & 0xf0) === 0x90 && data[2] > 0,
    )
    // voice 1 plays eighths: a quarter of a second each at 120
    expect(ons.map(({ time, data }) => [time, data[1]])).toEqual([
      [0, 60],
      [0.25, 60],
      [0.5, 64],
      [0.75, 64],
    ])
    expect(length).toBe(1)
  })

  it("runs as many passes as asked", () => {
    const { length } = audioTimeline(twoSteps(), { ...timing, passes: 3 })
    expect(length).toBe(3)
  })

  it("releases every note it starts", () => {
    const { messages } = audioTimeline(twoSteps(), timing)
    const count = (on: boolean) =>
      messages.filter(({ data }) =>
        on
          ? (data[0] & 0xf0) === 0x90 && data[2] > 0
          : (data[0] & 0xf0) === 0x80 ||
            ((data[0] & 0xf0) === 0x90 && data[2] === 0),
      ).length
    expect(count(false)).toBe(count(true))
  })
})

describe("encoding", () => {
  it("writes WAV at the depth asked", () => {
    const bytes = encodeWav(tone(8000), 8000, 24)
    const view = new DataView(bytes.buffer)
    expect(text(bytes, 0, 4)).toBe("RIFF")
    expect(text(bytes, 8, 4)).toBe("WAVE")
    // PCM, two channels, the rate, 24 bits
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(8000)
    expect(view.getUint16(34, true)).toBe(24)
    expect(bytes.length).toBe(44 + 8000 * 2 * 3)
  })

  it("writes 32-bit WAV as floating point", () => {
    const bytes = encodeWav(tone(8000).slice(0, 1), 8000, 32)
    const view = new DataView(bytes.buffer)
    expect(view.getUint16(20, true)).toBe(3)
    expect(view.getUint16(22, true)).toBe(1)
  })

  it("writes MP3 frames, telling its progress as it goes", () => {
    const told: number[] = []
    const bytes = encodeMp3(tone(44100), 44100, 128, (done) => told.push(done))
    // an MPEG audio frame's sync word
    const sync = bytes.findIndex(
      (byte, at) => byte === 0xff && (bytes[at + 1] & 0xe0) === 0xe0,
    )
    expect(sync).toBeGreaterThanOrEqual(0)
    // about a second at 128 kbps
    expect(bytes.length).toBeGreaterThan(12000)
    expect(bytes.length).toBeLessThan(20000)
    expect(told.at(-1)).toBe(1)
  })

  it("normalizes to just under full scale, both sides alike", () => {
    const [left, right] = tone(1000)
    right[0] = -0.5
    normalize([left, right])
    const peak = Math.max(...[...left, ...right].map(Math.abs))
    expect(peak).toBeCloseTo(10 ** (-1 / 20), 5)
    expect(right[0]).toBeCloseTo(-(10 ** (-1 / 20)), 5)
  })
})

describe("rendering a file", () => {
  const render = async (settings: Partial<AudioRenderSettings>) => {
    const request: AudioRenderRequest = {
      patch: twoSteps(),
      soundFont: new ArrayBuffer(8),
      settings: {
        format: "wav",
        sampleRate: 44100,
        channels: 2,
        wavBitDepth: 16,
        mp3Bitrate: 128,
        passes: 1,
        tail: 0,
        normalize: true,
        ...settings,
      },
      seed: 1,
      accentAmount: 0,
      modulationCCs: true,
    }
    const told: AudioRenderProgress[] = []
    const bytes = await renderAudio(request, (progress) => told.push(progress))
    return { bytes, told }
  }

  it("writes a WAV of the sequence, its sound told before its file", async () => {
    const { bytes, told } = await render({ format: "wav" })
    expect(text(bytes, 0, 4)).toBe("RIFF")
    expect(text(bytes, 8, 4)).toBe("WAVE")
    // two steps of a quarter note at 120: a second of 16-bit stereo
    expect(bytes.length).toBe(44 + 44100 * 2 * 2)
    const phases = told.map(({ phase }) => phase)
    expect(phases.indexOf("encode")).toBe(phases.lastIndexOf("render") + 1)
    expect(told.at(-1)).toEqual({ phase: "encode", done: 1 })
  })

  it("writes an MP3 of it when that is the format", async () => {
    const { bytes, told } = await render({ format: "mp3", channels: 1 })
    const sync = bytes.findIndex(
      (byte, at) => byte === 0xff && (bytes[at + 1] & 0xe0) === 0xe0,
    )
    expect(sync).toBeGreaterThanOrEqual(0)
    expect(text(bytes, 0, 4)).not.toBe("RIFF")
    expect(told.at(-1)).toEqual({ phase: "encode", done: 1 })
  })
})
