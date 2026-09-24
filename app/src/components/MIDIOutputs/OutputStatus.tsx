import { FC } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"

/**
 * Why nothing can be heard, said beside the transport rather than inside the
 * routing menu. Picking an instrument makes no sound on its own, and the
 * built-in sound takes a moment to fetch its SoundFont — both of which look
 * exactly like a broken sequencer from the outside.
 */
export const OutputStatus: FC = () => {
  const { synthStore } = useStores()
  const state = useMobxGetter(synthStore, "state")
  const error = useMobxGetter(synthStore, "error")
  const { outputNames } = useMIDIDevice()

  const routed =
    outputNames.all.length > 0 ||
    outputNames.voices.some((name) => name !== null)

  const message =
    state === "loading" ? (
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
    // an output element is a status region already
    <output className="flex max-w-[20rem] items-center truncate px-1 text-small text-fg-secondary">
      {message}
    </output>
  )
}
