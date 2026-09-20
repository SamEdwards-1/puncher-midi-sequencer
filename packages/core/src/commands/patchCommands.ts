import {
  JumpJSON,
  ModOutJSON,
  ModSource,
  PatchJSON,
  PatternStepJSON,
  StepIndex,
  StepJSON,
  StepState,
  VoiceJSON,
} from "../entities/types"

/**
 * Edits to a patch. Each returns a new patch and leaves the old one untouched,
 * which keeps undo snapshots cheap: a snapshot is just a reference.
 */

export const setSequencer = (
  patch: PatchJSON,
  changes: Partial<PatchJSON>,
): PatchJSON => ({ ...patch, ...changes })

export const setVoice = (
  patch: PatchJSON,
  index: number,
  changes: Partial<VoiceJSON>,
): PatchJSON => ({
  ...patch,
  voices: patch.voices.map((voice, current) =>
    current === index ? { ...voice, ...changes } : voice,
  ),
})

export const setPatternStep = (
  patch: PatchJSON,
  voiceIndex: number,
  dotIndex: number,
  changes: Partial<PatternStepJSON>,
): PatchJSON =>
  setVoice(patch, voiceIndex, {
    pattern: patch.voices[voiceIndex].pattern.map((dot, current) =>
      current === dotIndex ? { ...dot, ...changes } : dot,
    ),
  })

export const togglePatternStep = (
  patch: PatchJSON,
  voiceIndex: number,
  dotIndex: number,
): PatchJSON =>
  setPatternStep(patch, voiceIndex, dotIndex, {
    on: !patch.voices[voiceIndex].pattern[dotIndex].on,
  })

export const setStep = (
  patch: PatchJSON,
  index: StepIndex,
  changes: Partial<StepJSON>,
): PatchJSON => ({
  ...patch,
  steps: patch.steps.map((step, current) =>
    current === index ? { ...step, ...changes } : step,
  ),
})

// Notes are stored sorted and unique, and never exceed the patch's limit.
export const setStepNotes = (
  patch: PatchJSON,
  index: StepIndex,
  notes: number[],
): PatchJSON =>
  setStep(patch, index, {
    notes: [...new Set(notes)]
      .sort((a, b) => a - b)
      .slice(0, patch.maxNotesPerStep),
  })

export const setStepState = (
  patch: PatchJSON,
  index: StepIndex,
  state: StepState,
): PatchJSON => setStep(patch, index, { state })

export const setJump = (
  patch: PatchJSON,
  index: StepIndex,
  changes: Partial<JumpJSON>,
): PatchJSON =>
  setStep(patch, index, { jump: { ...patch.steps[index].jump, ...changes } })

export const setModOut = (
  patch: PatchJSON,
  source: ModSource,
  changes: Partial<ModOutJSON>,
): PatchJSON => ({
  ...patch,
  modOuts: patch.modOuts.map((modOut) =>
    modOut.source === source ? { ...modOut, ...changes } : modOut,
  ),
})

// Drops notes above the limit for good, so lowering it can be made permanent.
export const trimStepsToLimit = (patch: PatchJSON): PatchJSON => ({
  ...patch,
  steps: patch.steps.map((step) =>
    step.notes.length > patch.maxNotesPerStep
      ? { ...step, notes: step.notes.slice(0, patch.maxNotesPerStep) }
      : step,
  ),
})
