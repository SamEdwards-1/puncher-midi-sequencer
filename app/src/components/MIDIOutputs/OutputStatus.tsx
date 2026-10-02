import { FC, useEffect, useRef, useState } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Toast, ToastAction, ToastTone } from "../ui/Toast"

/**
 * Why nothing is happening, said in a toast rather than inside the
 * settings. Recording with no input ticked, a sequence with nowhere to play
 * and a SoundFont still loading all look exactly like a broken sequencer from
 * the outside.
 */
export const OutputStatus: FC = () => {
  const { synthStore, recorder, settingsTab } = useStores()
  const state = useMobxGetter(synthStore, "state")
  const error = useMobxGetter(synthStore, "error")
  const recordingError = useMobxGetter(recorder, "recordingError")
  const { outputNames, inputNames } = useMIDIDevice()
  const { isRecording } = useRecorder()
  const { isPlaying } = usePlayer()
  const localized = useLocalization()
  // dismissed until it's something else that's wrong, or play is pressed
  // with it still wrong
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    if (isPlaying) {
      setDismissed(null)
    }
  }, [isPlaying])

  const routed =
    outputNames.all.length > 0 ||
    outputNames.voices.some((name) => name !== null)

  const kind =
    recordingError !== null
      ? "recording-error"
      : isRecording && inputNames.length === 0
        ? "no-input"
        : state === "loading"
          ? "synth-loading"
          : state === "error"
            ? "synth-error"
            : routed
              ? null
              : "no-output"

  const open = kind !== null && kind !== dismissed
  // what it said last, kept while it slides away
  const last = useRef(kind)
  if (open) {
    last.current = kind
  }
  const shown = last.current
  if (shown === null) {
    return null
  }

  // nothing routed is as good as broken: play and nothing happens
  const tone: ToastTone =
    shown === "synth-loading"
      ? "info"
      : shown === "no-input"
        ? "warning"
        : "error"

  return (
    <Toast
      open={open}
      tone={tone}
      action={
        shown === "no-output" ? (
          <ToastAction onClick={() => settingsTab.show("midi")}>
            <Localized name="sequencer-status-open-settings" />
          </ToastAction>
        ) : undefined
      }
      title={recordingError ?? undefined}
      dismissLabel={localized["sequencer-status-dismiss"]}
      onDismiss={() => setDismissed(shown)}
    >
      {shown === "recording-error" ? (
        recordingError
      ) : shown === "no-input" ? (
        <Localized name="sequencer-no-input" />
      ) : shown === "synth-loading" ? (
        <Localized name="sequencer-synth-loading" />
      ) : shown === "synth-error" ? (
        <>
          <Localized name="sequencer-synth-error" /> {error}
        </>
      ) : (
        <Localized name="sequencer-no-output" />
      )}
    </Toast>
  )
}
