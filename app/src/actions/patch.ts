import {
  addStepCC,
  addStepNote,
  CCEventJSON,
  clearStep,
  PatchJSON,
  PatternStepJSON,
  pasteStep,
  removeStepCC,
  removeStepNote,
  StepJSON,
  StepState,
  setPatternStep,
  setSequencer,
  setStepNote,
  setStepState,
  setVoice,
  togglePatternStep,
  transposeStep,
  trimStepsToLimit,
  updateStepCC,
  VoiceJSON,
} from "@midiseq/core"
import { useCallback } from "react"
import { useStores } from "../hooks/useStores"

/**
 * Every edit records the patch for undo first, then replaces it. A key marks
 * a continuous gesture (a drag, or a held stepper) so it lands as one entry.
 */
export function usePatchEditor() {
  const { sequencerStore, history } = useStores()

  const apply = useCallback(
    (next: PatchJSON, key?: string) => {
      history.push(key)
      sequencerStore.patch = next
    },
    [sequencerStore, history],
  )

  return {
    editSequencer: useCallback(
      (changes: Partial<PatchJSON>, key?: string) =>
        apply(setSequencer(sequencerStore.patch, changes), key),
      [apply, sequencerStore],
    ),
    editVoice: useCallback(
      (index: number, changes: Partial<VoiceJSON>, key?: string) =>
        apply(setVoice(sequencerStore.patch, index, changes), key),
      [apply, sequencerStore],
    ),
    editPatternStep: useCallback(
      (
        voiceIndex: number,
        dotIndex: number,
        changes: Partial<PatternStepJSON>,
        key?: string,
      ) =>
        apply(
          setPatternStep(sequencerStore.patch, voiceIndex, dotIndex, changes),
          key,
        ),
      [apply, sequencerStore],
    ),
    togglePatternDot: useCallback(
      (voiceIndex: number, dotIndex: number) =>
        apply(togglePatternStep(sequencerStore.patch, voiceIndex, dotIndex)),
      [apply, sequencerStore],
    ),
    editStepState: useCallback(
      (step: number, state: StepState) =>
        apply(setStepState(sequencerStore.patch, step, state)),
      [apply, sequencerStore],
    ),
    addNote: useCallback(
      (step: number, note: number) =>
        apply(addStepNote(sequencerStore.patch, step, note)),
      [apply, sequencerStore],
    ),
    editNote: useCallback(
      (step: number, position: number, note: number) =>
        apply(
          setStepNote(sequencerStore.patch, step, position, note),
          `note-${step}-${position}`,
        ),
      [apply, sequencerStore],
    ),
    removeNote: useCallback(
      (step: number, position: number) =>
        apply(removeStepNote(sequencerStore.patch, step, position)),
      [apply, sequencerStore],
    ),
    transpose: useCallback(
      (step: number, semitones: number) =>
        apply(
          transposeStep(sequencerStore.patch, step, semitones),
          `transpose-${step}`,
        ),
      [apply, sequencerStore],
    ),
    addCC: useCallback(
      (step: number, cc: Omit<CCEventJSON, "id">) =>
        apply(addStepCC(sequencerStore.patch, step, cc)),
      [apply, sequencerStore],
    ),
    editCC: useCallback(
      (step: number, id: number, changes: Partial<Omit<CCEventJSON, "id">>) =>
        apply(
          updateStepCC(sequencerStore.patch, step, id, changes),
          `cc-${step}-${id}`,
        ),
      [apply, sequencerStore],
    ),
    removeCC: useCallback(
      (step: number, id: number) =>
        apply(removeStepCC(sequencerStore.patch, step, id)),
      [apply, sequencerStore],
    ),
    clearStepContent: useCallback(
      (step: number) => apply(clearStep(sequencerStore.patch, step)),
      [apply, sequencerStore],
    ),
    paste: useCallback(
      (step: number, source: StepJSON) =>
        apply(pasteStep(sequencerStore.patch, step, source)),
      [apply, sequencerStore],
    ),
    trimToLimit: useCallback(
      () => apply(trimStepsToLimit(sequencerStore.patch)),
      [apply, sequencerStore],
    ),
  }
}
