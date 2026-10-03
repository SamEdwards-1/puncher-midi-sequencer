import PauseIcon from "mdi-react/PauseIcon"
import PlayIcon from "mdi-react/PlayIcon"
import RecordIcon from "mdi-react/RecordIcon"
import StopIcon from "mdi-react/StopIcon"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatchSelector } from "../../hooks/usePatch"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import {
  Localized,
  useFormat,
  useLocalization,
} from "../../localize/useLocalization"
import { ToolbarButton } from "../ui/Button"
import { Stepper } from "../ui/Stepper"

export const TransportControls: FC = () => {
  const { isPlaying, isPaused, play, pause, stop } = usePlayer()
  const { isRecording, toggleRecording } = useRecorder()
  const { editSequencer } = usePatchEditor()
  const localized = useLocalization()
  const format = useFormat()
  const tempo = usePatchSelector((patch) => patch.tempo)
  // Pause in Play's place while the sequence moves; Play then plays on
  const running = isPlaying && !isPaused

  return (
    <div className="flex items-center gap-2">
      {/* to Play's left, so Play stays where it was */}
      {isPlaying && (
        <ToolbarButton type="button" onClick={stop}>
          <StopIcon size={16} />
          <Localized name="sequencer-stop" />
        </ToolbarButton>
      )}
      <ToolbarButton
        type="button"
        active={running}
        onClick={running ? pause : play}
      >
        {running ? (
          <>
            <PauseIcon size={16} />
            <Localized name="sequencer-pause" />
          </>
        ) : (
          <>
            <PlayIcon size={16} />
            <Localized name="sequencer-play" />
          </>
        )}
      </ToolbarButton>
      <ToolbarButton
        type="button"
        accent="record"
        active={isRecording}
        onClick={toggleRecording}
      >
        <RecordIcon size={16} />
        <Localized name="sequencer-record" />
      </ToolbarButton>
      <div className="w-32">
        <Stepper
          label={localized["sequencer-tempo"]}
          value={tempo}
          min={20}
          max={400}
          format={(value) => format("sequencer-bpm-value", { bpm: value })}
          // typing "96", "96 BPM" or "96.4" all mean the same thing
          parse={(text) => {
            const number = Number.parseFloat(text.replace(/[^0-9.]/g, ""))
            return Number.isFinite(number) ? Math.round(number) : null
          }}
          onChange={(tempo) => editSequencer({ tempo }, "tempo")}
        />
      </div>
    </div>
  )
}
