import { Mp3Encoder } from "@breezystack/lamejs"
import {
  controlChangeBytes,
  exportBeats,
  PatchJSON,
  renderSequence,
} from "@midiseq/core"
import {
  MIDIController,
  SoundBankLoader,
  SpessaSynthProcessor,
} from "spessasynth_core"
import WavEncoder from "wav-encoder"
import { AllOutDedupe } from "../services/AllOutDedupe"

export type AudioFormat = "wav" | "mp3"

// 32 is floating point, as WAV keeps it
export type WavBitDepth = 16 | 24 | 32

export const AUDIO_FORMATS: AudioFormat[] = ["wav", "mp3"]
export const SAMPLE_RATES = [44100, 48000]
export const WAV_BIT_DEPTHS: WavBitDepth[] = [16, 24, 32]
export const MP3_BITRATES = [128, 192, 256, 320]
export const AUDIO_CHANNELS = [2, 1]
export const MAX_TAIL_SECONDS = 10

export const AUDIO_EXTENSIONS: Record<AudioFormat, string> = {
  wav: ".wav",
  mp3: ".mp3",
}

/** How a render sounds and what it is written as. */
export interface AudioRenderSettings {
  format: AudioFormat
  sampleRate: number
  // 2 for stereo, 1 to fold both sides into one
  channels: number
  wavBitDepth: WavBitDepth
  // kilobits a second
  mp3Bitrate: number
  // how many times through the sequence
  passes: number
  // seconds left to ring out after the last step, for releases and reverb
  tail: number
  // raised or lowered so the loudest moment peaks just short of full scale
  normalize: boolean
}

export interface AudioRenderRequest {
  patch: PatchJSON
  // the SoundFont the built-in sound plays
  soundFont: ArrayBuffer
  settings: AudioRenderSettings
  // chance and the random rules are rolled from this, as an export's are
  seed: number
  accentAmount: number
  // whether the envelopes driving modulated settings reach the synth, as
  // they do the outputs while playing
  modulationCCs: boolean
}

// How far along a render is: its sound, then its file, each from 0 to 1.
export interface AudioRenderProgress {
  phase: "render" | "encode"
  done: number
}

/** A MIDI message and when it plays, in seconds from the start. */
export interface TimedMessage {
  time: number
  data: number[]
}

/**
 * What the synth hears over a render and how long the sequence lasts, in
 * seconds: each voice's instrument set first, as the built-in sound sets
 * them, then the notes and CCs a performance sends. Notes pass through the
 * same tidying the All output does, so two voices on one note sound once.
 */
export const audioTimeline = (
  patch: PatchJSON,
  {
    passes,
    seed,
    accentAmount,
    modulationCCs,
  }: {
    passes: number
    seed: number
    accentAmount: number
    modulationCCs: boolean
  },
): { messages: TimedMessage[]; length: number } => {
  const seconds = (beat: number) => (beat * 60) / patch.tempo
  const messages: TimedMessage[] = patch.voices.map((voice) => ({
    time: 0,
    data: [0xc0 | ((voice.channel - 1) & 0x0f), voice.program],
  }))
  const dedupe = new AllOutDedupe()
  const events = renderSequence(patch, {
    voices: [],
    ccs: [],
    layout: "combined",
    passes,
    seed,
    accentAmount,
  })
  for (const event of events) {
    const time = seconds(event.beat)
    const sent =
      event.type === "noteOn"
        ? dedupe.noteOn(
            event.voice,
            event.channel,
            event.note,
            event.velocity,
            time,
          )
        : event.type === "noteOff"
          ? dedupe.noteOff(event.voice, event.channel, event.note)
          : event.type === "cc" &&
              (modulationCCs || event.source !== "modulation")
            ? [controlChangeBytes(event.channel, event.cc, event.value)]
            : []
    for (const data of sent) {
      messages.push({ time, data })
    }
  }
  return { messages, length: seconds(exportBeats(patch, passes)) }
}

// The synth reads its controls between blocks this long, as it does live.
const BLOCK = 128

// how often, at most, progress is told: a hundred times over a render
const PROGRESS_STEPS = 100

// Plays one MIDI message on the synth, its channels counted from 0.
const play = (
  synth: SpessaSynthProcessor,
  [status, first, second]: number[],
) => {
  const channel = status & 0x0f
  switch (status & 0xf0) {
    case 0x90:
      if (second > 0) {
        synth.noteOn(channel, first, second)
      } else {
        synth.noteOff(channel, first)
      }
      break
    case 0x80:
      synth.noteOff(channel, first)
      break
    case 0xb0:
      synth.controllerChange(channel, first as MIDIController, second)
      break
    case 0xc0:
      synth.programChange(channel, first)
      break
  }
}

/**
 * The messages played through a SoundFont, as stereo samples `length`
 * seconds long. Each message lands on its own sample; between them the
 * synth runs a block at a time.
 */
export const renderSamples = async (
  messages: readonly TimedMessage[],
  soundFont: ArrayBuffer,
  sampleRate: number,
  length: number,
  onProgress: (done: number) => void = () => {},
): Promise<[Float32Array, Float32Array]> => {
  const synth = new SpessaSynthProcessor(sampleRate, {
    eventsEnabled: false,
    maxBufferSize: BLOCK,
  })
  synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(soundFont),
    "main",
  )
  await synth.processorInitialized
  // a busy passage is heard in full, not cut down to the live voice cap
  synth.setSystemParameter("autoAllocateVoices", true)

  const total = Math.max(1, Math.ceil(length * sampleRate))
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const due = [...messages].sort((a, b) => a.time - b.time)
  let next = 0
  let told = -1
  for (let at = 0; at < total; ) {
    while (next < due.length && Math.round(due[next].time * sampleRate) <= at) {
      play(synth, due[next].data)
      next++
    }
    const until =
      next < due.length ? Math.round(due[next].time * sampleRate) : total
    const count = Math.min(BLOCK, total - at, Math.max(1, until - at))
    synth.process(left, right, at, count)
    at += count
    const step = Math.floor((at / total) * PROGRESS_STEPS)
    if (step !== told) {
      told = step
      onProgress(at / total)
    }
  }
  synth.destroySynthProcessor()
  return [left, right]
}

// Scales every channel alike so the loudest sample sits at this, -1 dBFS.
const NORMAL_PEAK = 10 ** (-1 / 20)

export const normalize = (channels: Float32Array[]) => {
  let peak = 0
  for (const samples of channels) {
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample))
    }
  }
  if (peak === 0) {
    return
  }
  const gain = NORMAL_PEAK / peak
  for (const samples of channels) {
    for (let index = 0; index < samples.length; index++) {
      samples[index] *= gain
    }
  }
}

// Both sides as one, at the level each had.
const mono = ([left, right]: Float32Array[]) =>
  left.map((sample, index) => (sample + right[index]) / 2)

export const encodeWav = (
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: WavBitDepth,
): Uint8Array<ArrayBuffer> =>
  new Uint8Array(
    WavEncoder.encode.sync(
      { sampleRate, channelData: channels },
      { bitDepth, float: bitDepth === 32, symmetric: false },
    ),
  )

// LAME takes whole frames of this many samples most readily.
const MP3_FRAME = 1152

const pcm16 = (samples: Float32Array) =>
  Int16Array.from(samples, (sample) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    return Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff)
  })

export const encodeMp3 = (
  channels: Float32Array[],
  sampleRate: number,
  bitrate: number,
  onProgress: (done: number) => void = () => {},
): Uint8Array<ArrayBuffer> => {
  const encoder = new Mp3Encoder(channels.length, sampleRate, bitrate)
  const pcm = channels.map(pcm16)
  const length = pcm[0].length
  // a chunk of frames at a time, so progress can be told as it goes
  const chunk = MP3_FRAME * 64
  const parts: Uint8Array[] = []
  for (let from = 0; from < length; from += chunk) {
    const to = Math.min(length, from + chunk)
    const [left, right] = pcm.map((samples) => samples.subarray(from, to))
    parts.push(encoder.encodeBuffer(left, right))
    onProgress(to / length)
  }
  parts.push(encoder.flush())
  const bytes = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

/**
 * The sequence as an audio file, played through the built-in sound's
 * SoundFont, from its start for as many passes as asked, then left to ring
 * out. It takes a while, so it tells how far along it is as it goes.
 */
export const renderAudio = async (
  {
    patch,
    soundFont,
    settings,
    seed,
    accentAmount,
    modulationCCs,
  }: AudioRenderRequest,
  onProgress: (progress: AudioRenderProgress) => void = () => {},
): Promise<Uint8Array<ArrayBuffer>> => {
  const { messages, length } = audioTimeline(patch, {
    passes: settings.passes,
    seed,
    accentAmount,
    modulationCCs,
  })
  const stereo = await renderSamples(
    messages,
    soundFont,
    settings.sampleRate,
    length + settings.tail,
    (done) => onProgress({ phase: "render", done }),
  )
  const channels = settings.channels === 1 ? [mono(stereo)] : stereo
  if (settings.normalize) {
    normalize(channels)
  }
  onProgress({ phase: "encode", done: 0 })
  const bytes =
    settings.format === "mp3"
      ? encodeMp3(channels, settings.sampleRate, settings.mp3Bitrate, (done) =>
          onProgress({ phase: "encode", done }),
        )
      : encodeWav(channels, settings.sampleRate, settings.wavBitDepth)
  onProgress({ phase: "encode", done: 1 })
  return bytes
}
