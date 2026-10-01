import { reaction } from "mobx"
import { useEffect } from "react"
import { useSetSelectedStep } from "./useSequencerView"
import { useStores } from "./useStores"

/**
 * While the sequence plays, the step editor follows it: each step that
 * sounds is selected as it lands, so its notes and envelopes are shown with
 * the playhead crossing them. The lane open in the envelope editor is left
 * as it is, as it is when a step is clicked.
 */
export function useFollowPlayback() {
  const { player } = useStores()
  const setSelected = useSetSelectedStep()
  useEffect(
    () =>
      reaction(
        () => player.step,
        (step) => {
          if (step !== null) {
            setSelected(step)
          }
        },
        // mounted mid-sequence, it goes straight to the step sounding
        { fireImmediately: true },
      ),
    [player, setSelected],
  )
}
