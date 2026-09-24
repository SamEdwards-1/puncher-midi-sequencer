import { FC } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useRecorder } from "../../hooks/useRecorder"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"

/**
 * Why nothing is happening, said beside the transport rather than inside the
 * settings. Recording with no input ticked, a sequence with nowhere to play
 * and a SoundFont still loading all look exactly like a broken sequencer from
 * the outside.
 */
export const OutputStatus: FC = () => {
  const { synthStore } = useStores()
  const state = useMobxGetter(synthStore, "state")
  const error = useMobxGetter(synthStore, "error")
  const { outputNames, inputNames } = useMIDIDevice()
  const { isRecording } = useRecorder()

  const routed =
    outputNames.all.length > 0 ||
    outputNames.voices.some((name) => name !== null)

  const message =
    isRecording && inputNames.length === 0 ? (
      <Localized name="sequencer-no-input" />
    ) : state === "loading" ? (
      <Localized name="sequencer-synth-loading" />
    ) : state === "error" ? (
      <>
        <Localized name="sequencer-synth-error" /> {error}
      </>
    ) : routed ? null : (
      <Localized name="sequencer-no-output" />
    )

  if (message === null) {
    return null
  }

  return (
    // an output element is a status region already. Contained, so its text
    // never widens the bar's right side: it fills what room there is and
    // truncates.
    <output className="block max-w-[20rem] grow truncate text-right [contain:inline-size] px-1 text-small text-fg-secondary">
      {message}
    </output>
  )
}
