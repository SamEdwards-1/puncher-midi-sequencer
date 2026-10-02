import { previewsAlike, StepIndex, StepPreview } from "@midiseq/core"
import { useEffect, useSyncExternalStore } from "react"
import { ShownStepPreview } from "../services/StepWork"
import { useAccentAmount } from "./useAccentAmount"
import { useMobxSelector } from "./useMobxSelector"
import { usePatchSelector } from "./usePatch"
import { useStores } from "./useStores"

const sameLive = (a: StepPreview | null, b: StepPreview | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.notes === b.notes &&
    a.voiceDots === b.voiceDots)

/**
 * What a step plays, and the dot each voice has come round to as it lands:
 * as the sequence plays it this time round while it sounds, and otherwise
 * as it plays the first time the sequence reaches it. Voices free of the
 * steps come to a step at a different point in their patterns each time
 * round, so the notes of one time are not another's. The first time is
 * shared by everything showing the step, and made only while the step is
 * not sounding.
 */
export function useStepPreview(step: StepIndex): ShownStepPreview {
  // the patch as far as a preview hears it, so an edit none would hear —
  // the tempo, say — passes this by
  const patch = usePatchSelector((patch) => patch, [], previewsAlike)
  const { player, stepWork } = useStores()
  const { accentAmount } = useAccentAmount()
  // woken by the rounds on this step, and not by those on the others
  const live = useMobxSelector(
    () => {
      const round = player.roundNotes
      return round?.step === step && player.voiceDots !== null
        ? { notes: round.notes, voiceDots: player.voiceDots }
        : null
    },
    [player, step],
    sameLive,
  )
  useSyncExternalStore(stepWork.subscribe, stepWork.snapshot)
  useEffect(() => {
    if (live === null) stepWork.requestPreview(patch, step, accentAmount)
  }, [stepWork, patch, step, accentAmount, live])
  return live ?? stepWork.readPreview(patch, step, accentAmount)
}
