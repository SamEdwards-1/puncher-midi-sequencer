import { StepIndex, StepPreview } from "@midiseq/core"
import { useAccentAmount } from "./useAccentAmount"
import { useMobxSelector } from "./useMobxSelector"
import { usePatch } from "./usePatch"
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
export function useStepPreview(step: StepIndex): StepPreview {
  const patch = usePatch()
  const { player, stepPreviews } = useStores()
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
  return live ?? stepPreviews.get(patch, step, { accentAmount })
}
