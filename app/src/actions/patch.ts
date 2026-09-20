import {
  PatchJSON,
  PatternStepJSON,
  setPatternStep,
  setSequencer,
  setVoice,
  togglePatternStep,
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
  }
}
