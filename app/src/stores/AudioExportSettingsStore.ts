import { action, makeObservable, observable } from "mobx"
import {
  AUDIO_CHANNELS,
  AUDIO_FORMATS,
  AudioRenderSettings,
  MAX_TAIL_SECONDS,
  MP3_BITRATES,
  SAMPLE_RATES,
  WAV_BIT_DEPTHS,
} from "../audio/audioExport"
import { MAX_EXPORT_PASSES } from "./ExportSettingsStore"
import { defaultStorage, read, write } from "./storage"

const STORAGE_KEY = "midiseq.audioExport"

// CD quality as WAV, a good MP3 bitrate, time for a release to fade, and
// brought up to full level, as the synth on its own plays well under it
export const AUDIO_EXPORT_DEFAULTS: AudioRenderSettings = {
  format: "wav",
  sampleRate: 44100,
  channels: 2,
  wavBitDepth: 16,
  mp3Bitrate: 192,
  passes: 1,
  tail: 2,
  normalize: true,
}

const oneOf = <T>(choices: readonly T[], value: unknown, fallback: T): T =>
  choices.includes(value as T) ? (value as T) : fallback

const within = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback

// Settings as given, where they make sense; the defaults elsewhere.
const valid = (given: Partial<AudioRenderSettings>): AudioRenderSettings => {
  const defaults = AUDIO_EXPORT_DEFAULTS
  return {
    format: oneOf(AUDIO_FORMATS, given.format, defaults.format),
    sampleRate: oneOf(SAMPLE_RATES, given.sampleRate, defaults.sampleRate),
    channels: oneOf(AUDIO_CHANNELS, given.channels, defaults.channels),
    wavBitDepth: oneOf(WAV_BIT_DEPTHS, given.wavBitDepth, defaults.wavBitDepth),
    mp3Bitrate: oneOf(MP3_BITRATES, given.mp3Bitrate, defaults.mp3Bitrate),
    passes: within(given.passes, 1, MAX_EXPORT_PASSES, defaults.passes),
    tail: within(given.tail, 0, MAX_TAIL_SECONDS, defaults.tail),
    normalize:
      typeof given.normalize === "boolean"
        ? given.normalize
        : defaults.normalize,
  }
}

const load = (storage: Storage | null): AudioRenderSettings => {
  const saved = read(storage, STORAGE_KEY)
  return valid(
    saved !== null && typeof saved === "object"
      ? (saved as Partial<AudioRenderSettings>)
      : {},
  )
}

/**
 * How File → Render Audio renders, kept with this machine's other settings
 * so the next render starts where the last one left off.
 */
export class AudioExportSettingsStore {
  settings: AudioRenderSettings

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    this.settings = load(storage)
    makeObservable(this, {
      settings: observable.ref,
      set: action,
    })
  }

  /** Changes one setting, kept to what it can be, and remembers it. */
  set = <K extends keyof AudioRenderSettings>(
    key: K,
    value: AudioRenderSettings[K],
  ) => {
    this.settings = valid({ ...this.settings, [key]: value })
    write(this.storage, STORAGE_KEY, this.settings)
  }
}
