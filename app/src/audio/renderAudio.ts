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
import {
  type AudioRenderProgress,
  type AudioRenderRequest,
  MAX_RENDER_SECONDS,
  renderSeconds,
  type WavBitDepth,
} from "./audioExport"

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

// Both sides as one, at the level each had: folded into the left, so a
// mono render never holds a third copy of its sound.
const mono = ([left, right]: Float32Array[]) => {
  for (let index = 0; index < left.length; index++) {
    left[index] = (left[index] + right[index]) / 2
  }
  return left
}

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

/**
 * The sequence as an audio file, played through the built-in sound's
 * SoundFont, from its start for as many passes as asked, then left to ring
 * out. It takes a while, so it tells how far along it is as it goes. One
 * longer than a render can be is refused before anything is made.
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
  if (renderSeconds(patch, settings) > MAX_RENDER_SECONDS) {
    throw new Error(
      `A render can be at most ${MAX_RENDER_SECONDS / 60} minutes long`,
    )
  }
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
  let bytes: Uint8Array<ArrayBuffer>
  if (settings.format === "mp3") {
    const { encodeMp3 } = await import("./encodeMp3")
    bytes = encodeMp3(
      channels,
      settings.sampleRate,
      settings.mp3Bitrate,
      (done) => onProgress({ phase: "encode", done }),
    )
  } else {
    bytes = encodeWav(channels, settings.sampleRate, settings.wavBitDepth)
  }
  onProgress({ phase: "encode", done: 1 })
  return bytes
}
