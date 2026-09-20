import {
  CCEventJSON,
  JumpJSON,
  MAX_NOTES_PER_STEP,
  ModOutJSON,
  ModSource,
  PatchJSON,
  PatternStepJSON,
  StepIndex,
  StepJSON,
  StepState,
  VoiceJSON,
} from "../entities/types"

const clampNote = (note: number) => Math.min(127, Math.max(0, Math.round(note)))

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

/**
 * Notes keep the order they were put in, so editing one never shuffles the
 * rows under the pointer; the engine sorts them when it reads a step. They
 * are unique, clamped to the MIDI range, and capped at 16. The patch's own
 * Max Notes per Step only decides how many the engine reads, so lowering it
 * never destroys notes.
 */
export const setStepNotes = (
  patch: PatchJSON,
  index: StepIndex,
  notes: number[],
): PatchJSON =>
  setStep(patch, index, {
    notes: [...new Set(notes.map(clampNote))].slice(0, MAX_NOTES_PER_STEP),
  })

export const addStepNote = (
  patch: PatchJSON,
  index: StepIndex,
  note: number,
): PatchJSON => setStepNotes(patch, index, [...patch.steps[index].notes, note])

/**
 * Moving a note onto a pitch the step already holds would merge the two, so
 * it carries on in the same direction to the next free pitch instead. With no
 * free pitch left in that direction, the note stays where it is.
 */
export const setStepNote = (
  patch: PatchJSON,
  index: StepIndex,
  position: number,
  note: number,
): PatchJSON => {
  const notes = patch.steps[index].notes
  const isTaken = (pitch: number) =>
    notes.some(
      (existing, current) => current !== position && existing === pitch,
    )

  const target = clampNote(note)
  const step = target < notes[position] ? -1 : 1
  let free = target
  while (isTaken(free)) {
    free += step
    if (free < 0 || free > 127) {
      return patch
    }
  }

  return setStepNotes(
    patch,
    index,
    notes.map((existing, current) => (current === position ? free : existing)),
  )
}

export const removeStepNote = (
  patch: PatchJSON,
  index: StepIndex,
  position: number,
): PatchJSON =>
  setStepNotes(
    patch,
    index,
    patch.steps[index].notes.filter((_, current) => current !== position),
  )

export const transposeStep = (
  patch: PatchJSON,
  index: StepIndex,
  semitones: number,
): PatchJSON =>
  setStepNotes(
    patch,
    index,
    patch.steps[index].notes.map((note) => note + semitones),
  )

const nextCCId = (patch: PatchJSON): number =>
  patch.steps.reduce(
    (highest, step) =>
      step.ccs.reduce((id, cc) => Math.max(id, cc.id), highest),
    0,
  ) + 1

export const addStepCC = (
  patch: PatchJSON,
  index: StepIndex,
  cc: Omit<CCEventJSON, "id">,
): PatchJSON =>
  setStep(patch, index, {
    ccs: [...patch.steps[index].ccs, { ...cc, id: nextCCId(patch) }],
  })

export const updateStepCC = (
  patch: PatchJSON,
  index: StepIndex,
  id: number,
  changes: Partial<Omit<CCEventJSON, "id">>,
): PatchJSON =>
  setStep(patch, index, {
    ccs: patch.steps[index].ccs.map((cc) =>
      cc.id === id ? { ...cc, ...changes } : cc,
    ),
  })

export const removeStepCC = (
  patch: PatchJSON,
  index: StepIndex,
  id: number,
): PatchJSON =>
  setStep(patch, index, {
    ccs: patch.steps[index].ccs.filter((cc) => cc.id !== id),
  })

export const clearStep = (patch: PatchJSON, index: StepIndex): PatchJSON =>
  setStep(patch, index, { notes: [], ccs: [] })

// Copies notes, CCs, state and jump onto another step.
export const pasteStep = (
  patch: PatchJSON,
  index: StepIndex,
  source: StepJSON,
): PatchJSON =>
  setStep(patch, index, {
    notes: [...source.notes],
    ccs: source.ccs.map((cc, offset) => ({
      ...cc,
      id: nextCCId(patch) + offset,
    })),
    state: source.state,
    jump: { ...source.jump },
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
// It keeps the lowest ones, which are the notes the engine was playing.
export const trimStepsToLimit = (patch: PatchJSON): PatchJSON => ({
  ...patch,
  steps: patch.steps.map((step) =>
    step.notes.length > patch.maxNotesPerStep
      ? {
          ...step,
          notes: step.notes
            .filter((note) =>
              [...step.notes]
                .sort((a, b) => a - b)
                .slice(0, patch.maxNotesPerStep)
                .includes(note),
            )
            .slice(0, patch.maxNotesPerStep),
        }
      : step,
  ),
})
