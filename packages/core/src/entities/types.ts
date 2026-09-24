import type { PaceId } from "./paces"

export type StepIndex = number
export type VoiceIndex = 0 | 1 | 2 | 3
export type OutputTarget = "all" | VoiceIndex

export const VOICE_COUNT = 4

// A step's notes are what the voices draw from, so there can be no more of
// them than there are voices. Step Notes may ask for fewer.
export const NOTES_PER_STEP = VOICE_COUNT

// What a step may still carry from a file saved while the count was a
// setting. Anything past NOTES_PER_STEP is shown dimmed and can be trimmed.
export const MAX_NOTES_PER_STEP = 16
export const MAX_PATTERN_LENGTH = 16

export type GridSize = "small" | "large"
export type StepState = "normal" | "rest" | "skip"
export type Direction =
  | "fwd"
  | "bwd"
  | "fwdbwd"
  | "bwdfwd"
  | "random"
  | "random+"
export type LoopMode = "recorded" | "all" | "custom"

export type JumpRule =
  | { kind: "always" }
  | { kind: "times"; n: 1 | 2 | 3 | 4 | 5 | 6 | 7 }
  | { kind: "every"; n: 2 | 3 | 4 | 5 | 6 | 7 | 8 }
  | { kind: "chance"; pct: Probability }
  | { kind: "last" }
  | { kind: "notLast" }

export interface JumpJSON {
  rule: JumpRule
  dest: StepIndex | null
  // null means "the next step in the current direction"
  normal: StepIndex | null
}

// A breakpoint on a step's envelope. `time` runs from the step's start (0)
// to its end (1), so the envelope stretches with the sequencer's pace;
// `value` is the CC value there, 0-127.
export interface EnvelopePointJSON {
  time: number
  value: number
}

/**
 * A CC as a curve over one step: breakpoints joined by straight lines. The
 * value holds at the first point's before it and the last point's after it,
 * so a single point is a plain CC message sent on landing. Two points at the
 * same time make a jump.
 */
export interface EnvelopeJSON {
  id: number
  cc: number
  // 1-16. A step's CC belongs to no voice, so it goes to every output.
  channel: number
  // sorted by time
  points: EnvelopePointJSON[]
}

export interface StepJSON {
  // sorted ascending; the engine reads the lowest maxNotesPerStep of them
  notes: number[]
  envelopes: EnvelopeJSON[]
  state: StepState
  jump: JumpJSON
}

export interface LoopJSON {
  mode: LoopMode
  end: StepIndex
}

export type Articulation = "none" | "hold" | "tie"
export type Accent = "none" | "+" | "-"
export type Ratchet = 1 | 2 | 3 | 4
export type Probability = 10 | 25 | 33 | 50 | 67 | 75 | 90 | 100
export type PatternCondition =
  | "always"
  | "2:2"
  | "3:3"
  | "4:4"
  | "1x"
  | "2x"
  | "3x"
  | "last"
  | "notLast"

export interface PatternStepJSON {
  on: boolean
  articulation: Articulation
  accent: Accent
  ratchet: Ratchet
  probability: Probability
  condition: PatternCondition
}

export type VoiceRule =
  | "nth"
  | "lowest"
  | "highest"
  | "random"
  | "up"
  | "down"
  | "updown"
  | "downup"
  | "updown+"
  | "downup+"
  | "rise"
  | "fall"

export interface VoiceJSON {
  enabled: boolean
  pace: PaceId
  // gate length as a fraction of the pace, 0.1..1
  length: number
  rule: VoiceRule
  offset: number
  patternLength: number
  pattern: PatternStepJSON[]
  velocity: number
  channel: number
  // General MIDI program, used by the built-in sound
  program: number
}

export type ModSource =
  | "seqX"
  | "seqY"
  | "phase"
  | "actionOr"
  | "voice1Random"
  | "voice2Random"
  | "voice3Random"
  | "voice4Random"

export interface ModOutJSON {
  source: ModSource
  enabled: boolean
  cc: number
  min: number
  max: number
  smoothing: number
}

export interface PatchJSON {
  version: 1
  name: string
  size: GridSize
  loop: LoopJSON
  // 1 to NOTES_PER_STEP
  maxNotesPerStep: number
  syncVoices: boolean
  pace: PaceId
  direction: Direction
  shiftAmt: number
  tempo: number
  steps: StepJSON[]
  voices: VoiceJSON[]
  modOuts: ModOutJSON[]
}

export type ActionButton = "hang" | "bump" | "flip" | "shift"
