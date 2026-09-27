import type { PaceId } from "./paces"
import type { ScaleFit, ScaleJSON } from "./scale"

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

// A breakpoint on a step's envelope. `time` is in beats from the step's
// start, so an envelope keeps its timing when the sequencer's pace changes:
// a shorter step plays only what fits, a longer one holds the last value.
// `value` is the CC value there, 0-127.
export interface EnvelopePointJSON {
  time: number
  value: number
}

/**
 * How an envelope gets from one point to the next: holding each value until
 * the next point and jumping there, as a MIDI controller's messages do, or
 * along a straight line.
 */
export type EnvelopeShape = "steps" | "ramps"

/**
 * A CC as a curve over one step: breakpoints, stepped or joined by straight
 * lines. The value holds at the first point's before it and the last
 * point's after it, so a single point is a plain CC message sent on
 * landing. Two points at the same time make a jump.
 */
export interface EnvelopeJSON {
  id: number
  cc: number
  // 1-16. A step's CC belongs to no voice, so it goes to every output.
  channel: number
  // Ramps when missing: envelopes were only ever ramps before they could
  // step, so an older file still plays as it did. New ones step.
  shape?: EnvelopeShape
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
  // the dot's own velocity, as an offset from its voice's; an accent moves
  // it further (see velocity.ts)
  velocityOffset: number
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
  // how a note the offset moves out of the patch's scale is fitted to it
  offsetFit: ScaleFit
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

/** A voice's settings that a CC can modulate. */
export type VoiceSetting =
  | "pace"
  | "length"
  | "rule"
  | "offset"
  | "offsetFit"
  | "patternLength"

/** The sequencer's settings that a CC can modulate. */
export type SequencerSetting = "pace" | "scale" | "shiftFit"

/**
 * An action a CC can drive: Hang, Flip and Shift for the whole sequence,
 * Bump for one voice, so each voice can be bumped on steps of its own.
 */
export type ActionTarget =
  | { kind: "action"; setting: "hang" | "flip" | "shift" }
  | { kind: "action"; setting: "bump"; voice: VoiceIndex }

export type ModulationTarget =
  | { kind: "voice"; voice: VoiceIndex; setting: VoiceSetting }
  | { kind: "sequencer"; setting: SequencerSetting }
  | ActionTarget

/** A scale a modulation can move to: a tonic and one of SEQUENCER_SCALES. */
export interface ScaleChoiceJSON {
  tonic: number
  name: string
}

/**
 * One of a setting's values, as the setting holds it: a pace's id, a
 * length, a rule, an offset, a fit, a pattern length, a scale — null for
 * none — or whether an action is on.
 */
export type ModulationValue = number | string | boolean | ScaleChoiceJSON | null

/**
 * A setting driven by a CC. Where a step has an envelope for `cc`, the
 * setting follows it across that step; elsewhere it keeps its own value.
 * The CC's 0 stands for `from` and its 127 for `to`, with the setting's
 * values between them spread evenly across the rest, in the order its
 * field lists them — backwards when `from` comes after `to`.
 */
export interface ModulationJSON {
  target: ModulationTarget
  cc: number
  from: ModulationValue
  to: ModulationValue
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
  // how a note the shift moves out of the scale is fitted to it
  shiftFit: ScaleFit
  tempo: number
  // the scale the patch is in, if any: notes outside it are marked, and
  // those imported or recorded are fitted to it as its fit says
  scale: ScaleJSON | null
  steps: StepJSON[]
  voices: VoiceJSON[]
  modOuts: ModOutJSON[]
  // at most one for each setting
  modulations: ModulationJSON[]
}

export type ActionButton = "hang" | "bump" | "flip" | "shift"
