import { createDefaultStep, createDefaultVoice } from "../entities/defaults"
import {
  EnvelopeJSON,
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
import { velocityToDot } from "../entities/velocity"

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

/**
 * Sets the velocity a dot plays at, as drawn in the velocity lane: an accent
 * where it lands on or near one, the dot's own velocity anywhere else.
 */
export const setDotVelocity = (
  patch: PatchJSON,
  voiceIndex: number,
  dotIndex: number,
  velocity: number,
  accentAmount: number,
): PatchJSON =>
  setPatternStep(
    patch,
    voiceIndex,
    dotIndex,
    velocityToDot(patch.voices[voiceIndex].velocity, accentAmount, velocity),
  )

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
 * are unique, clamped to the MIDI range, and capped at 16 — what a file from
 * before the count was fixed may carry. The engine reads the lowest
 * NOTES_PER_STEP of them, so the extras are kept but never sound.
 */
export const setStepNotes = (
  patch: PatchJSON,
  index: StepIndex,
  notes: number[],
): PatchJSON =>
  setStep(patch, index, {
    notes: [...new Set(notes.map(clampNote))].slice(0, MAX_NOTES_PER_STEP),
  })

// A note past the step's limit would never sound, so it is refused.
export const addStepNote = (
  patch: PatchJSON,
  index: StepIndex,
  note: number,
): PatchJSON =>
  patch.steps[index].notes.length >= patch.maxNotesPerStep
    ? patch
    : setStepNotes(patch, index, [...patch.steps[index].notes, note])

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

// Unique across the patch, so an envelope keeps its identity when its step
// is copied elsewhere.
export const nextEnvelopeId = (patch: PatchJSON): number =>
  patch.steps.reduce(
    (highest, step) =>
      step.envelopes.reduce(
        (id, envelope) => Math.max(id, envelope.id),
        highest,
      ),
    0,
  ) + 1

// Brightness first, as the first CC added always was; after that the next
// number the step isn't already using on that channel.
const FIRST_CC = 74

export const nextFreeCC = (step: StepJSON, channel: number): number => {
  const used = new Set(
    step.envelopes
      .filter((envelope) => envelope.channel === channel)
      .map((envelope) => envelope.cc),
  )
  for (let offset = 0; offset < 128; offset++) {
    const cc = (FIRST_CC + offset) % 128
    if (!used.has(cc)) {
      return cc
    }
  }
  return FIRST_CC
}

export const addEnvelope = (
  patch: PatchJSON,
  index: StepIndex,
  envelope: Omit<EnvelopeJSON, "id">,
): PatchJSON =>
  setStep(patch, index, {
    envelopes: [
      ...patch.steps[index].envelopes,
      { ...envelope, id: nextEnvelopeId(patch) },
    ],
  })

export const updateEnvelope = (
  patch: PatchJSON,
  index: StepIndex,
  id: number,
  changes: Partial<Omit<EnvelopeJSON, "id">>,
): PatchJSON =>
  setStep(patch, index, {
    envelopes: patch.steps[index].envelopes.map((envelope) =>
      envelope.id === id ? { ...envelope, ...changes } : envelope,
    ),
  })

export const removeEnvelope = (
  patch: PatchJSON,
  index: StepIndex,
  id: number,
): PatchJSON =>
  setStep(patch, index, {
    envelopes: patch.steps[index].envelopes.filter(
      (envelope) => envelope.id !== id,
    ),
  })

export const clearStep = (patch: PatchJSON, index: StepIndex): PatchJSON =>
  setStep(patch, index, { notes: [], envelopes: [] })

/**
 * Empties the sequence: every step back to no notes, no envelopes, no jump
 * and no rest or skip, and every voice back to its default settings and
 * pattern.
 * How the patch is played — size, pace, direction, loop, tempo — is left
 * alone, since none of that is the music.
 */
export const clearPatch = (patch: PatchJSON): PatchJSON => ({
  ...patch,
  steps: patch.steps.map(() => createDefaultStep()),
  voices: patch.voices.map((_, index) => createDefaultVoice(index)),
})

// Copies notes, envelopes, state and jump onto another step.
export const pasteStep = (
  patch: PatchJSON,
  index: StepIndex,
  source: StepJSON,
): PatchJSON =>
  setStep(patch, index, {
    notes: [...source.notes],
    envelopes: source.envelopes.map((envelope, offset) => ({
      ...envelope,
      id: nextEnvelopeId(patch) + offset,
      points: envelope.points.map((point) => ({ ...point })),
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
