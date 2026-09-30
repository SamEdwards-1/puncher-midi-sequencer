import { createDefaultPatch, PatchJSON } from "@midiseq/core"
import { describe, expect, it, vi } from "vitest"
import WavEncoder from "wav-encoder"
import {
  type AudioRenderProgress,
  type AudioRenderRequest,
  type AudioRenderSettings,
  renderSeconds,
} from "./audioExport"
import { Mp3Writer } from "./encodeMp3"
import { WavWriter } from "./encodeWav"
import { audioTimeline, CHUNK, normalGain, renderAudio } from "./renderAudio"

// There is no SoundFont to play in a test, so the synth is a stand-in that
// plays a quiet tone whatever it is sent, adding it to what is there, as
// the synth adds its voices: the render around it is what is tested here.
vi.mock("spessasynth_core", () => ({
  MIDIController: {},
  SoundBankLoader: { fromArrayBuffer: () => ({}) },
  SpessaSynthProcessor: class {
    // samples played so far
    played = 0
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
      for (let index = 0; index < count; index++) {
        const sample = Math.sin((this.played + index) / 20) * 0.25
        left[at + index] += sample
        right[at + index] += sample
      }
      this.played += count
    }
    destroySynthProcessor() {}
  },
}))

// the stand-in's tone, as a sample in a Float32Array holds it
const stoodIn = (index: number) => Math.fround(Math.sin(index / 20) * 0.25)

// two steps a quarter note each at 120, one note in each, voice 1 alone
const twoSteps = (): PatchJSON => {
  const patch = createDefaultPatch()
  patch.pace = "4th"
  patch.steps[0].notes = [60]
  patch.steps[1].notes = [64]
  return patch
}

const timing = { passes: 1, seed: 1, accentAmount: 0, modulationCCs: true }

const timeline = (patch: PatchJSON, options = timing) => [
  ...audioTimeline(patch, options),
]

// a second of a quiet sine, on both sides
const tone = (sampleRate: number, level = 0.25) => {
  const samples = Float32Array.from(
    { length: sampleRate },
    (_, index) => Math.sin((index / sampleRate) * 2 * Math.PI * 440) * level,
  )
  return [samples, samples.slice()]
}

// pieces of a file, as one
const joined = (pieces: readonly Uint8Array[]) => {
  const bytes = new Uint8Array(
    pieces.reduce((total, piece) => total + piece.length, 0),
  )
  let at = 0
  for (const piece of pieces) {
    bytes.set(piece, at)
    at += piece.length
  }
  return bytes
}

// samples cut into pieces `length` long, the last shorter
const cut = (channels: Float32Array[], length: number) => {
  const pieces: Float32Array[][] = []
  for (let from = 0; from < channels[0].length; from += length) {
    pieces.push(
      channels.map((samples) => samples.subarray(from, from + length)),
    )
  }
  return pieces
}

const text = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.slice(from, from + length))

// an MPEG audio frame's sync word
const hasMp3Frame = (bytes: Uint8Array) =>
  bytes.some((byte, at) => byte === 0xff && (bytes[at + 1] & 0xe0) === 0xe0)

describe("the audio timeline", () => {
  it("sets each voice's instrument first, on its channel", () => {
    const patch = twoSteps()
    patch.voices[0].program = 33
    const messages = timeline(patch)
    const programs = messages.filter(({ data }) => (data[0] & 0xf0) === 0xc0)
    expect(programs[0]).toEqual({
      time: 0,
      data: [0xc0 | (patch.voices[0].channel - 1), 33],
    })
    expect(messages.slice(0, patch.voices.length)).toEqual(programs)
  })

  it("times the notes in seconds at the patch's tempo", () => {
    const patch = twoSteps()
    const ons = timeline(patch).filter(
      ({ data }) => (data[0] & 0xf0) === 0x90 && data[2] > 0,
    )
    // voice 1 plays eighths: a quarter of a second each at 120
    expect(ons.map(({ time, data }) => [time, data[1]])).toEqual([
      [0, 60],
      [0.25, 60],
      [0.5, 64],
      [0.75, 64],
    ])
    expect(renderSeconds(patch, { passes: 1, tail: 0 })).toBe(1)
  })

  it("runs as many passes as asked", () => {
    const patch = twoSteps()
    expect(renderSeconds(patch, { passes: 3, tail: 0 })).toBe(3)
    const ons = timeline(patch, { ...timing, passes: 3 }).filter(
      ({ data }) => (data[0] & 0xf0) === 0x90 && data[2] > 0,
    )
    // the last eighth of the third pass
    expect(ons.at(-1)?.time).toBe(2.75)
  })

  it("comes in the order it plays, and the same each time it is read", () => {
    const patch = createDefaultPatch()
    patch.steps.forEach((step, index) => {
      step.notes = [60 + index]
    })
    const options = { ...timing, passes: 4 }
    const messages = timeline(patch, options)
    const times = messages.map(({ time }) => time)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(timeline(patch, options)).toEqual(messages)
  })

  it("releases every note it starts", () => {
    const messages = timeline(twoSteps())
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
    const sound = tone(8000)
    const wav = new WavWriter(2, 8000, 24, 8000)
    const bytes = joined([wav.start(), wav.encode(sound), wav.finish()])
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

  it.each([
    16, 24, 32,
  ] as const)("writes %i-bit WAV a piece at a time as wav-encoder wrote it whole", (depth) => {
    // loud enough to clip, both ways
    const sound = tone(8000, 1.5)
    const wav = new WavWriter(2, 8000, depth, 8000)
    const bytes = joined([
      wav.start(),
      ...cut(sound, 3001).map((piece) => wav.encode(piece)),
      wav.finish(),
    ])
    const whole = new Uint8Array(
      WavEncoder.encode.sync(
        { sampleRate: 8000, channelData: sound },
        { bitDepth: depth, float: depth === 32, symmetric: false },
      ),
    )
    expect(bytes).toEqual(whole)
  })

  it("turns away a WAV longer than the format can hold", () => {
    // a little over 4 GB of 32-bit stereo
    expect(() => new WavWriter(2, 48000, 32, 2 ** 29)).toThrow(
      "too long for a WAV file",
    )
    expect(() => new WavWriter(1, 48000, 16, 2 ** 29)).not.toThrow()
  })

  it("writes MP3 frames, the same however the sound is cut", () => {
    const sound = tone(44100)
    const encode = (length: number) => {
      const mp3 = new Mp3Writer(2, 44100, 128)
      return joined([
        mp3.start(),
        ...cut(sound, length).map((piece) => mp3.encode(piece)),
        mp3.finish(),
      ])
    }
    const bytes = encode(44100)
    expect(hasMp3Frame(bytes)).toBe(true)
    // about a second at 128 kbps
    expect(bytes.length).toBeGreaterThan(12000)
    expect(bytes.length).toBeLessThan(20000)
    expect(encode(5000)).toEqual(bytes)
    expect(encode(1152)).toEqual(bytes)
  })

  it("brings a sound to just under full scale", () => {
    expect(0.5 * normalGain(0.5)).toBeCloseTo(10 ** (-1 / 20), 10)
    // silence stays as it is
    expect(normalGain(0)).toBe(1)
  })
})

describe("rendering a file", () => {
  const request = (
    settings: Partial<AudioRenderSettings>,
    patch = twoSteps(),
  ): AudioRenderRequest => ({
    patch,
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
  })

  const render = async (
    settings: Partial<AudioRenderSettings>,
    patch = twoSteps(),
  ) => {
    const pieces: Uint8Array[] = []
    const told: AudioRenderProgress[] = []
    await renderAudio(
      request(settings, patch),
      async (bytes) => {
        pieces.push(bytes)
      },
      (progress) => told.push(progress),
    )
    return { bytes: joined(pieces), pieces, told }
  }

  // the samples of a 32-bit mono WAV
  const samplesOf = (bytes: Uint8Array) =>
    new Float32Array(bytes.slice(44).buffer)

  it("writes a WAV of the sequence, its level found before its file", async () => {
    const { bytes, told } = await render({ format: "wav" })
    expect(text(bytes, 0, 4)).toBe("RIFF")
    expect(text(bytes, 8, 4)).toBe("WAVE")
    // two steps of a quarter note at 120: a second of 16-bit stereo
    expect(bytes.length).toBe(44 + 44100 * 2 * 2)
    const phases = told.map(({ phase }) => phase)
    expect(phases.indexOf("render")).toBe(phases.lastIndexOf("measure") + 1)
    expect(told.at(-1)).toEqual({ phase: "render", done: 1 })
  })

  it("plays it once, straight into the file, when it isn't normalized", async () => {
    const { told } = await render({ normalize: false })
    expect(told.every(({ phase }) => phase === "render")).toBe(true)
  })

  it("writes an MP3 of it when that is the format", async () => {
    const { bytes, told } = await render({ format: "mp3", channels: 1 })
    expect(hasMp3Frame(bytes)).toBe(true)
    expect(text(bytes, 0, 4)).not.toBe("RIFF")
    expect(told.at(-1)).toEqual({ phase: "render", done: 1 })
  })

  it("folds both sides into one for mono", async () => {
    const { bytes } = await render({ format: "wav", channels: 1 })
    const view = new DataView(bytes.buffer)
    expect(view.getUint16(22, true)).toBe(1)
    expect(bytes.length).toBe(44 + 44100 * 2)
  })

  it("writes it a chunk at a time, the sound running on unbroken between", async () => {
    // three seconds: a few chunks' worth
    const { bytes, pieces } = await render({
      normalize: false,
      channels: 1,
      wavBitDepth: 32,
      passes: 3,
    })
    // the header, then no piece more than a chunk and a block
    expect(pieces[0].length).toBe(44)
    expect(pieces.length).toBeGreaterThan(3)
    for (const piece of pieces.slice(1)) {
      expect(piece.length).toBeLessThanOrEqual((CHUNK + 128) * 4)
    }
    const samples = samplesOf(bytes)
    expect(samples.length).toBe(3 * 44100)
    const wrong = samples.findIndex(
      (sample, index) => sample !== stoodIn(index),
    )
    expect(wrong).toBe(-1)
  })

  it("normalizes in two passes to just under full scale", async () => {
    const { bytes } = await render({
      normalize: true,
      channels: 1,
      wavBitDepth: 32,
      passes: 3,
    })
    const samples = samplesOf(bytes)
    const peak = samples.reduce(
      (top, sample) => Math.max(top, Math.abs(sample)),
      0,
    )
    expect(peak).toBeCloseTo(10 ** (-1 / 20), 5)
    // the same sound, brought up alike throughout
    const gain = samples[1] / stoodIn(1)
    expect(samples[100000]).toBeCloseTo(stoodIn(100000) * gain, 5)
  })

  it("waits for each piece to be written before making the next", async () => {
    let writing = 0
    let most = 0
    let pieces = 0
    await renderAudio(request({ passes: 3 }), async () => {
      writing++
      pieces++
      most = Math.max(most, writing)
      await new Promise((done) => setTimeout(done, 0))
      writing--
    })
    expect(pieces).toBeGreaterThan(3)
    expect(most).toBe(1)
  })

  it("stops when a piece can't be written", async () => {
    let pieces = 0
    await expect(
      renderAudio(request({ passes: 3 }), async () => {
        pieces++
        if (pieces === 2) {
          throw new Error("The disk is full")
        }
      }),
    ).rejects.toThrow("The disk is full")
    expect(pieces).toBe(2)
  })

  it("renders however long the sequence runs", async () => {
    // 3 BPM: forty seconds a pass
    const patch = twoSteps()
    patch.tempo = 3
    const { bytes } = await render(
      { normalize: false, channels: 1, sampleRate: 44100 },
      patch,
    )
    expect(bytes.length).toBe(44 + 40 * 44100 * 2)
  })
})
