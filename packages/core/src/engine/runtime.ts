import {
  MAX_PATTERN_LENGTH,
  PatchJSON,
  StepIndex,
  VoiceIndex,
} from "../entities/types"
import { DirectionState, initialDirectionState } from "./direction"
import { RuleCursor } from "./voiceRules"

export interface ActiveNote {
  note: number
  channel: number
  offBeat: number
}

export interface VoiceRuntime {
  nextBeat: number
  patternIndex: number
  // created on the first note, when the note count is known
  cursor: RuleCursor | null
  // by dot, how many passes of the pattern have reached it
  conditionCounts: number[]
  // whether the voice's previous dot played a note; null before its first
  lastPlayed: boolean | null
  activeNote: ActiveNote | null
}

// The envelopes of the step the sequencer is on, played across its length.
export interface EnvelopeRuntime {
  // the stored step, fixed on landing so Flip can't swap it mid-step
  step: StepIndex
  startBeat: number
  lengthBeats: number
  // the next sample, or Infinity once the step is over
  nextBeat: number
  // the last value sent for each envelope, by id
  sent: Record<number, number>
}

export interface EngineRuntime {
  started: boolean
  position: StepIndex
  // the first sequencer tick lands on the current step instead of advancing
  pendingFirstStep: boolean
  nextSeqBeat: number
  // where the sequencer last ticked, landing a step or holding one
  seqBeat: number
  directionState: DirectionState
  jumpCounts: number[]
  lastJumpResult: boolean | null
  queued: StepIndex | null
  voices: VoiceRuntime[]
  envelope: EnvelopeRuntime | null
}

export const createVoiceRuntime = (): VoiceRuntime => ({
  nextBeat: 0,
  patternIndex: 0,
  cursor: null,
  conditionCounts: Array.from({ length: MAX_PATTERN_LENGTH }, () => 0),
  lastPlayed: null,
  activeNote: null,
})

export const createRuntime = (patch: PatchJSON): EngineRuntime => ({
  started: false,
  position: 0,
  pendingFirstStep: true,
  nextSeqBeat: 0,
  seqBeat: Number.NEGATIVE_INFINITY,
  directionState: initialDirectionState(patch.direction),
  jumpCounts: Array.from({ length: patch.steps.length }, () => 0),
  lastJumpResult: null,
  queued: null,
  voices: patch.voices.map(createVoiceRuntime),
  envelope: null,
})

export const voiceIndexes: VoiceIndex[] = [0, 1, 2, 3]
