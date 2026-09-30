import { exportBeats, type PatchJSON } from "@midiseq/core"

// What an audio export can be, and what is said between the page and the
// render. The page reads these to draw its dialog and keep its settings, so
// they hold no renderer and import nothing that runs: the synth and the
// encoders are in renderAudio, which only the worker loads. Anything added
// here that pulls one of them in puts it back in the page's first download.

export type AudioFormat = "wav" | "mp3"

// 32 is floating point, as WAV keeps it
export type WavBitDepth = 16 | 24 | 32

export const AUDIO_FORMATS: AudioFormat[] = ["wav", "mp3"]
export const SAMPLE_RATES = [44100, 48000]
export const WAV_BIT_DEPTHS: WavBitDepth[] = [16, 24, 32]
export const MP3_BITRATES = [128, 192, 256, 320]
export const AUDIO_CHANNELS = [2, 1]
export const MAX_TAIL_SECONDS = 10

/** How long a render of the patch runs, in seconds, its tail included. */
export const renderSeconds = (
  patch: PatchJSON,
  { passes, tail }: Pick<AudioRenderSettings, "passes" | "tail">,
) => (exportBeats(patch, passes) * 60) / patch.tempo + tail

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
  // the SoundFont the built-in sound plays, handed over to the render: a
  // renderer may take it to another thread, leaving it empty here
  soundFont: ArrayBuffer
  settings: AudioRenderSettings
  // chance and the random rules are rolled from this, as an export's are
  seed: number
  accentAmount: number
  // whether the envelopes driving modulated settings reach the synth, as
  // they do the outputs while playing
  modulationCCs: boolean
}

// How far along a render is, from 0 to 1: finding its loudest moment,
// when it is to be normalized, then playing it into its file.
export interface AudioRenderProgress {
  phase: "measure" | "render"
  done: number
}

// What the page tells a render's worker: what to render, then, as each
// piece of the file it sent is written, that it has been.
export type AudioWorkerMessage =
  | { type: "render"; request: AudioRenderRequest }
  | { type: "written" }

// What the worker tells the page: how far along it is, each piece of the
// file in turn, and that it is done, or why it stopped.
export type AudioWorkerReply =
  | { type: "progress"; progress: AudioRenderProgress }
  | { type: "piece"; bytes: Uint8Array<ArrayBuffer> }
  | { type: "done" }
  | { type: "error"; message: string }
