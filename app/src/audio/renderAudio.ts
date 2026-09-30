import { controlChangeBytes, PatchJSON, sequenceEvents } from "@midiseq/core"
import {
  MIDIController,
  SoundBankLoader,
  SpessaSynthProcessor,
} from "spessasynth_core"
import { AllOutDedupe } from "../services/AllOutDedupe"
import {
  type AudioRenderProgress,
  type AudioRenderRequest,
  renderSeconds,
} from "./audioExport"
import { WavWriter } from "./encodeWav"

/** A MIDI message and when it plays, in seconds from the start. */
export interface TimedMessage {
  time: number
  data: number[]
}

/**
 * What the synth hears over a render, in seconds, in the order it plays:
 * each voice's instrument set first, as the built-in sound sets them, then
 * the notes and CCs a performance sends. Notes pass through the same
 * tidying the All output does, so two voices on one note sound once. It is
 * worked out as it is read, a step at a time, so however long the render,
 * it is never all held at once; read again, it is the same.
 */
export function* audioTimeline(
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
): Generator<TimedMessage, void, undefined> {
  const seconds = (beat: number) => (beat * 60) / patch.tempo
  for (const voice of patch.voices) {
    yield {
      time: 0,
      data: [0xc0 | ((voice.channel - 1) & 0x0f), voice.program],
    }
  }
  const dedupe = new AllOutDedupe()
  const events = sequenceEvents(patch, {
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
      yield { time, data }
    }
  }
}

// The synth reads its controls between blocks this long, as it does live.
const BLOCK = 128

// The sound is handed on in chunks of at least this many samples, about a
// second and a half: all of it that is ever held at once.
export const CHUNK = 65536

// how often, at most, progress is told: a hundred times over a pass
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

// Both sides as one, at the level each had, folded into the left.
const mono = ([left, right]: Float32Array[]) => {
  for (let index = 0; index < left.length; index++) {
    left[index] = (left[index] + right[index]) / 2
  }
  return left
}

/** How a render's sound is made: its rate, its length, and its sides. */
export interface SoundShape {
  sampleRate: number
  // samples long
  frames: number
  // 2 for stereo, 1 for both sides folded into one
  channels: number
}

/**
 * The messages, in the order they play, played through a SoundFont
 * `frames` samples long, and handed to `take` a chunk at a time: an array
 * for each channel. Each message lands on its own sample; between them the
 * synth runs a block at a time, exactly as it would into one long buffer,
 * so how the sound is cut into chunks doesn't change it — and the same
 * messages through the same SoundFont sound the same every time. A chunk
 * holds good only until `take` is done with it: the next one is made in
 * the same memory.
 */
export const playThrough = async (
  messages: Iterable<TimedMessage>,
  soundFont: ArrayBuffer,
  { sampleRate, frames, channels }: SoundShape,
  take: (chunk: Float32Array[]) => void | Promise<void>,
  onProgress: (done: number) => void = () => {},
): Promise<void> => {
  const synth = new SpessaSynthProcessor(sampleRate, {
    eventsEnabled: false,
    maxBufferSize: BLOCK,
  })
  try {
    synth.soundBankManager.addSoundBank(
      SoundBankLoader.fromArrayBuffer(soundFont),
      "main",
    )
    await synth.processorInitialized
    // a busy passage is heard in full, not cut down to the live voice cap
    synth.setSystemParameter("autoAllocateVoices", true)

    // room for a block past a chunk, so a block is never cut short at one
    const left = new Float32Array(CHUNK + BLOCK)
    const right = new Float32Array(CHUNK + BLOCK)
    const due = ({ time }: TimedMessage) => Math.round(time * sampleRate)
    const pending = messages[Symbol.iterator]()
    let next = pending.next()
    let filled = 0
    let told = -1
    for (let at = 0; at < frames; ) {
      while (!next.done && due(next.value) <= at) {
        play(synth, next.value.data)
        next = pending.next()
      }
      const until = next.done ? frames : due(next.value)
      const count = Math.min(BLOCK, frames - at, Math.max(1, until - at))
      synth.process(left, right, filled, count)
      at += count
      filled += count
      if (filled >= CHUNK || at === frames) {
        const sides = [left.subarray(0, filled), right.subarray(0, filled)]
        await take(channels === 1 ? [mono(sides)] : sides)
        // the synth adds its voices to what is there
        left.fill(0, 0, filled)
        right.fill(0, 0, filled)
        filled = 0
      }
      const step = Math.floor((at / frames) * PROGRESS_STEPS)
      if (step !== told) {
        told = step
        onProgress(at / frames)
      }
    }
  } finally {
    synth.destroySynthProcessor()
  }
}

// Scales every channel alike so the loudest sample sits at this, -1 dBFS.
const NORMAL_PEAK = 10 ** (-1 / 20)

// The loudest sample in a chunk, on any channel.
const peakOf = (chunk: readonly Float32Array[]) => {
  let peak = 0
  for (const samples of chunk) {
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample))
    }
  }
  return peak
}

/** What brings a sound peaking at `peak` to the normal peak. */
export const normalGain = (peak: number) =>
  peak === 0 ? 1 : NORMAL_PEAK / peak

const scale = (chunk: readonly Float32Array[], gain: number) => {
  for (const samples of chunk) {
    for (let index = 0; index < samples.length; index++) {
      samples[index] *= gain
    }
  }
}

// A file written a piece at a time: a header, the sound, then what is left.
interface AudioFileWriter {
  start(): Uint8Array<ArrayBuffer>
  encode(chunk: readonly Float32Array[]): Uint8Array<ArrayBuffer>
  finish(): Uint8Array<ArrayBuffer>
}

/**
 * The sequence as an audio file, played through the built-in sound's
 * SoundFont, from its start for as many passes as asked, then left to ring
 * out. The file is handed to `write` a piece at a time as it is made, each
 * piece written before the next is asked for, so a render of any length
 * holds only a chunk of its sound at a time. To be normalized it is played
 * twice: once to find its loudest moment, then again, brought to level, into
 * the file — the same both times, being worked out from the same seed. It
 * takes a while, so it tells how far along it is as it goes.
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
  write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
  onProgress: (progress: AudioRenderProgress) => void = () => {},
): Promise<void> => {
  const timeline = () =>
    audioTimeline(patch, {
      passes: settings.passes,
      seed,
      accentAmount,
      modulationCCs,
    })
  const shape: SoundShape = {
    sampleRate: settings.sampleRate,
    channels: settings.channels,
    frames: Math.max(
      1,
      Math.ceil(renderSeconds(patch, settings) * settings.sampleRate),
    ),
  }
  // made first, so a file too long for its format says so before any of it
  // is played
  const file: AudioFileWriter =
    settings.format === "mp3"
      ? new (await import("./encodeMp3")).Mp3Writer(
          shape.channels,
          shape.sampleRate,
          settings.mp3Bitrate,
        )
      : new WavWriter(
          shape.channels,
          shape.sampleRate,
          settings.wavBitDepth,
          shape.frames,
        )
  const send = async (bytes: Uint8Array<ArrayBuffer>) => {
    if (bytes.length > 0) {
      await write(bytes)
    }
  }

  let gain = 1
  if (settings.normalize) {
    let peak = 0
    await playThrough(
      timeline(),
      soundFont,
      shape,
      (chunk) => {
        peak = Math.max(peak, peakOf(chunk))
      },
      (done) => onProgress({ phase: "measure", done }),
    )
    gain = normalGain(peak)
  }

  await send(file.start())
  await playThrough(
    timeline(),
    soundFont,
    shape,
    async (chunk) => {
      if (gain !== 1) {
        scale(chunk, gain)
      }
      await send(file.encode(chunk))
    },
    (done) => onProgress({ phase: "render", done }),
  )
  await send(file.finish())
}
