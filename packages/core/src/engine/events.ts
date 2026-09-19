import { OutputTarget, StepIndex, VoiceIndex } from "../entities/types"

export interface NoteOnEvent {
  type: "noteOn"
  beat: number
  voice: VoiceIndex
  note: number
  velocity: number
  channel: number
}

export interface NoteOffEvent {
  type: "noteOff"
  beat: number
  voice: VoiceIndex
  note: number
  channel: number
}

export interface CCOutEvent {
  type: "cc"
  beat: number
  cc: number
  value: number
  channel: number
  output: OutputTarget
  source: "step" | "mod"
}

// Playhead move. `position` is the grid position; `step` is the stored step it
// plays, which differs from the position while Flip is held.
export interface StepAdvanceEvent {
  type: "step"
  beat: number
  position: StepIndex
  step: StepIndex
}

export type EngineEvent =
  | NoteOnEvent
  | NoteOffEvent
  | CCOutEvent
  | StepAdvanceEvent
