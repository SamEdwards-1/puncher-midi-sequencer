import { FC, useEffect, useRef, useState } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Toast, ToastAction, ToastLink, ToastTone } from "../ui/Toast"

// The docs' list of browsers with Web MIDI, and what to do in Safari
const BROWSER_SUPPORT_URL =
  "https://www.punchermidi.app/docs/introduction#browser-support"

/**
 * Why nothing is happening, said in a toast rather than inside the
 * settings. Recording with no input ticked, a sequence with nowhere to play
 * and a SoundFont still loading all look exactly like a broken sequencer from
 * the outside. So does a browser without Web MIDI, which can't reach a single
 * port.
 */
export const OutputStatus: FC = () => {
  const { synthStore, recorder, settingsTab } = useStores()
  const state = useMobxGetter(synthStore, "state")
  const error = useMobxGetter(synthStore, "error")
  const recordingError = useMobxGetter(recorder, "recordingError")
  const { isSupported, outputNames, inputNames } = useMIDIDevice()
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
  // the browser won't change while the app is open, so once is enough
  const [unsupportedDismissed, setUnsupportedDismissed] = useState(false)

  const routed =
    outputNames.all.length > 0 ||
    outputNames.voices.some((name) => name !== null)

  const kind =
    !isSupported && !unsupportedDismissed
      ? "midi-unsupported"
      : recordingError !== null
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
      : shown === "no-input" || shown === "midi-unsupported"
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
        ) : shown === "midi-unsupported" ? (
          <ToastLink href={BROWSER_SUPPORT_URL}>
            <Localized name="sequencer-midi-unsupported-browsers" />
          </ToastLink>
        ) : undefined
      }
      title={recordingError ?? undefined}
      dismissLabel={localized["sequencer-status-dismiss"]}
      onDismiss={() =>
        shown === "midi-unsupported"
          ? setUnsupportedDismissed(true)
          : setDismissed(shown)
      }
    >
      {shown === "midi-unsupported" ? (
        <Localized name="sequencer-midi-unsupported-toast" />
      ) : shown === "recording-error" ? (
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
