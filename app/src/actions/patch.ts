import {
  addEnvelope,
  addStepNote,
  clearPatch,
  clearStep,
  EnvelopeJSON,
  JumpJSON,
  PatchJSON,
  PatternStepJSON,
  pasteStep,
  removeEnvelope,
  removeStepNote,
  StepJSON,
  StepState,
  setJump,
  setPatternStep,
  setPatterns,
  setSequencer,
  setStepNote,
  setStepState,
  setVoice,
  togglePatternStep,
  transposeStep,
  trimStepsToLimit,
  updateEnvelope,
  VoiceJSON,
  VoicePattern,
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
    clearAll: useCallback(
      () => apply(clearPatch(sequencerStore.patch)),
      [apply, sequencerStore],
    ),
    editSequencer: useCallback(
      (changes: Partial<PatchJSON>, key?: string) =>
        apply(setSequencer(sequencerStore.patch, changes), key),
      [apply, sequencerStore],
    ),
    replacePatterns: useCallback(
      (voices: VoicePattern[]) =>
        apply(setPatterns(sequencerStore.patch, voices)),
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
    editJump: useCallback(
      (step: number, changes: Partial<JumpJSON>) =>
        apply(setJump(sequencerStore.patch, step, changes)),
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
    addEnvelope: useCallback(
      (step: number, envelope: Omit<EnvelopeJSON, "id">) =>
        apply(addEnvelope(sequencerStore.patch, step, envelope)),
      [apply, sequencerStore],
    ),
    editEnvelope: useCallback(
      (
        step: number,
        id: number,
        changes: Partial<Omit<EnvelopeJSON, "id" | "points">>,
      ) =>
        apply(
          updateEnvelope(sequencerStore.patch, step, id, changes),
          `envelope-${step}-${id}`,
        ),
      [apply, sequencerStore],
    ),
    removeEnvelope: useCallback(
      (step: number, id: number) =>
        apply(removeEnvelope(sequencerStore.patch, step, id)),
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

/**
 * An edit made across a drag. The patch as it was goes into history once, at
 * the first change, and every move after replaces the patch directly, so the
 * whole gesture is one undo entry however long it takes — and a drag that
 * changes nothing leaves no entry at all.
 */
export function usePatchGesture() {
  const { sequencerStore, history } = useStores()

  return useCallback(() => {
    let recorded = false
    return (next: PatchJSON) => {
      if (next === sequencerStore.patch) {
        return
      }
      if (!recorded) {
        history.push()
        recorded = true
      }
      sequencerStore.patch = next
    }
  }, [sequencerStore, history])
}
