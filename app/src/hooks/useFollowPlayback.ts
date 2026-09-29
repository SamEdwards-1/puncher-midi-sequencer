import { reaction } from "mobx"
import { useEffect } from "react"
import { usePreviewOnClick, useSetSelectedStep } from "./useSequencerView"
import { useStores } from "./useStores"

/**
 * While Audition step is on, the step editor follows the sequence: each step
 * that sounds is selected as it lands, so its notes and envelopes are shown
 * with the playhead crossing them. The lane open in the envelope editor is
 * left as it is, as it is when a step is clicked.
 */
export function useFollowPlayback() {
  const { player } = useStores()
  const [audition] = usePreviewOnClick()
  const setSelected = useSetSelectedStep()
  useEffect(() => {
    if (!audition) {
      return
    }
    return reaction(
      () => player.step,
      (step) => {
        if (step !== null) {
          setSelected(step)
        }
      },
      // turned on mid-sequence, it goes straight to the step sounding
      { fireImmediately: true },
    )
  }, [player, audition, setSelected])
}
