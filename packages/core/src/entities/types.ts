import type { PaceId } from "./paces"

export type StepIndex = number
export type VoiceIndex = 0 | 1 | 2 | 3
export type OutputTarget = "all" | VoiceIndex

export const VOICE_COUNT = 4
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

export interface CCEventJSON {
  id: number
  cc: number
  value: number
  // "voice" means each voice's own channel
  channel: number | "voice"
  output: OutputTarget
}

export interface StepJSON {
  // sorted ascending; the engine reads the lowest maxNotesPerStep of them
  notes: number[]
  ccs: CCEventJSON[]
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
