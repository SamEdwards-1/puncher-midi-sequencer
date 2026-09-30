import { StepIndex, StepNote, stepNotes } from "@midiseq/core"
import { useMemo } from "react"
import { useAccentAmount } from "./useAccentAmount"
import { useMobxGetter } from "./useMobxSelector"
import { usePatch } from "./usePatch"
import { useStores } from "./useStores"

/**
 * The notes a step plays: as the sequence plays it this time round while it
 * sounds, and otherwise as it plays the first time the sequence reaches it.
 * Voices free of the steps come to a step at a different point in their
 * patterns each time round, so the notes of one time are not another's.
 */
export function useStepNotes(step: StepIndex): StepNote[] {
  const patch = usePatch()
  const { player } = useStores()
  const { accentAmount } = useAccentAmount()
  const round = useMobxGetter(player, "roundNotes")
  const first = useMemo(
    () => stepNotes(patch, step, { accentAmount }),
    [patch, step, accentAmount],
  )
  return round?.step === step ? round.notes : first
}
