import {
  addEnvelope,
  addStepNote,
  clearStep,
  deleteStep,
  EnvelopeJSON,
  editPattern,
  freeVoiceChannel,
  importMidi,
  insertStep,
  JumpJSON,
  MidiImportOptions,
  ModulationJSON,
  ModulationTarget,
  PatchJSON,
  PatternEdit,
  PatternStepJSON,
  PreparedMidi,
  pasteStep,
  removeEnvelope,
  removeModulation,
  removeStepNote,
  ScaleJSON,
  StepJSON,
  StepState,
  setJump,
  setModulation,
  setPatternStep,
  setPatterns,
  setScale,
  setSequencer,
  setStepNote,
  setStepState,
  setVoice,
  stepCount,
  togglePatternStep,
  transposeStep,
  trimStepsToLimit,
  updateEnvelope,
  VoiceJSON,
  VoicePattern,
} from "@midiseq/core"
import { useCallback } from "react"
import { useLandGrid, useShowGridEdit } from "../hooks/useSequencerView"
import { useStores } from "../hooks/useStores"

/**
 * Every edit records the patch for undo first, then replaces it. A key marks
 * a continuous gesture (a drag, or a held stepper) so it lands as one entry.
 */
export function usePatchEditor() {
  const { sequencerStore, history, recorder } = useStores()
  const landGrid = useLandGrid()
  const showGridEdit = useShowGridEdit()

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
    // the scale the patch is in; the notes the steps hold are let be
    editScale: useCallback(
      (scale: ScaleJSON | null) => apply(setScale(sequencerStore.patch, scale)),
      [apply, sequencerStore],
    ),
    replacePatterns: useCallback(
      (voices: VoicePattern[]) =>
        apply(setPatterns(sequencerStore.patch, voices)),
      [apply, sequencerStore],
    ),
    // A MIDI file into the steps, as one undoable edit, and the grid's
    // steps bounce in to show it has landed. A take ends first, so the
    // import isn't recorded over.
    importMidi: useCallback(
      (midi: PreparedMidi, options: MidiImportOptions) => {
        recorder.setRecording(false)
        apply(importMidi(sequencerStore.patch, midi, options))
        landGrid()
      },
      [apply, recorder, sequencerStore, landGrid],
    ),
    editVoice: useCallback(
      (index: number, changes: Partial<VoiceJSON>, key?: string) => {
        const patch = sequencerStore.patch
        // a channel another voice has moves on to the next free one
        const channel =
          changes.channel === undefined
            ? {}
            : { channel: freeVoiceChannel(patch, index, changes.channel) }
        apply(setVoice(patch, index, { ...changes, ...channel }), key)
      },
      [apply, sequencerStore],
    ),
    // every voice's Enable at once, as one undoable edit
    editVoicesEnabled: useCallback(
      (enabled: readonly boolean[]) =>
        apply(
          enabled.reduce(
            (patch, on, index) => setVoice(patch, index, { enabled: on }),
            sequencerStore.patch,
          ),
        ),
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
    rearrangePattern: useCallback(
      (voiceIndex: number, dotIndex: number, action: PatternEdit) => {
        const patch = sequencerStore.patch
        const next = editPattern(patch, voiceIndex, dotIndex, action)
        if (next !== patch) apply(next)
      },
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
    // an envelope's points, as stored, in beats
    editEnvelopePoints: useCallback(
      (
        step: number,
        id: number,
        points: EnvelopeJSON["points"],
        key?: string,
      ) =>
        apply(updateEnvelope(sequencerStore.patch, step, id, { points }), key),
      [apply, sequencerStore],
    ),
    removeEnvelope: useCallback(
      (step: number, id: number) =>
        apply(removeEnvelope(sequencerStore.patch, step, id)),
      [apply, sequencerStore],
    ),
    // Clearing ends a take first, so what was recorded and the clear are
    // two undo entries rather than one that loses both. This and the three
    // below show on the grid, its steps moving with the edit.
    clearStepContent: useCallback(
      (step: number) => {
        recorder.setRecording(false)
        apply(clearStep(sequencerStore.patch, step))
        showGridEdit("clear", step)
      },
      [apply, recorder, sequencerStore, showGridEdit],
    ),
    paste: useCallback(
      (step: number, source: StepJSON) => {
        apply(pasteStep(sequencerStore.patch, step, source))
        showGridEdit("paste", step)
      },
      [apply, sequencerStore, showGridEdit],
    ),
    // Moving steps ends a take too, since it is recording into a step by
    // where it is. The grid's last step goes off its end: with notes, it is
    // shown falling away.
    insertStep: useCallback(
      (step: number) => {
        recorder.setRecording(false)
        const patch = sequencerStore.patch
        const last = patch.steps[stepCount(patch.size) - 1]
        apply(insertStep(patch, step))
        showGridEdit(
          "insert",
          step,
          last.notes.length > 0 ? last.state : undefined,
        )
      },
      [apply, recorder, sequencerStore, showGridEdit],
    ),
    deleteStep: useCallback(
      (step: number) => {
        recorder.setRecording(false)
        apply(deleteStep(sequencerStore.patch, step))
        showGridEdit("delete", step)
      },
      [apply, recorder, sequencerStore, showGridEdit],
    ),
    trimToLimit: useCallback(
      () => apply(trimStepsToLimit(sequencerStore.patch)),
      [apply, sequencerStore],
    ),
    // a setting's modulation changed, its envelopes going with it
    editModulation: useCallback(
      (modulation: ModulationJSON, key?: string) =>
        apply(setModulation(sequencerStore.patch, modulation), key),
      [apply, sequencerStore],
    ),
    removeModulation: useCallback(
      (target: ModulationTarget) =>
        apply(removeModulation(sequencerStore.patch, target)),
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
