import {
  addModulationEnvelope,
  ModulationJSON,
  ModulationTarget,
  modulationOf,
  setModulation,
} from "@midiseq/core"
import { useCallback } from "react"
import {
  useRevealEnvelope,
  useSelectedLane,
  useSelectedStep,
} from "../hooks/useSequencerView"
import { useStores } from "../hooks/useStores"
import { trackModulations } from "../services/analytics"

/**
 * Opens a setting's modulation in the envelope editor, on the step in the
 * editor, and brings the editor into view. A step without an envelope for
 * its CC is given one, starting at the setting's own value so that nothing
 * changes until it is drawn on. Given `modulation`, the setting is given
 * that first, in the same undoable edit.
 */
export function useShowModulation() {
  const { sequencerStore, history } = useStores()
  const [step] = useSelectedStep()
  const [, setLane] = useSelectedLane()
  const [, setReveal] = useRevealEnvelope()

  return useCallback(
    (target: ModulationTarget, modulation?: ModulationJSON) => {
      const before = sequencerStore.patch
      const next = addModulationEnvelope(
        modulation === undefined ? before : setModulation(before, modulation),
        step,
        target,
      )
      if (next !== before) {
        history.push()
        sequencerStore.patch = next
        trackModulations(before, next, "editor")
      }
      const cc = modulationOf(next, target)?.cc
      if (cc === undefined) {
        return
      }
      const envelope = next.steps[step].envelopes.find((each) => each.cc === cc)
      setLane({ kind: "cc", cc, channel: envelope?.channel ?? 1 })
      setReveal(true)
    },
    [sequencerStore, history, step, setLane, setReveal],
  )
}
