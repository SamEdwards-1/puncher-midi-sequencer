import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useHistory } from "../../hooks/useHistory"
import { usePatch } from "../../hooks/usePatch"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { ToolbarButton } from "../ui/Button"
import { Stepper } from "../ui/Stepper"

export const TransportControls: FC = () => {
  const { isPlaying, position, play, stop, panic } = usePlayer()
  const { isRecording, target, toggleRecording } = useRecorder()
  const { canUndo, canRedo, undo, redo } = useHistory()
  const { editSequencer } = usePatchEditor()
  const localized = useLocalization()
  const patch = usePatch()

  return (
    <div className="flex items-center gap-2">
      <ToolbarButton type="button" disabled={!canUndo} onClick={undo}>
        <Localized name="sequencer-undo" />
      </ToolbarButton>
      <ToolbarButton type="button" disabled={!canRedo} onClick={redo}>
        <Localized name="sequencer-redo" />
      </ToolbarButton>
      <ToolbarButton
        type="button"
        active={isPlaying}
        onClick={isPlaying ? stop : play}
      >
        {isPlaying ? (
          <Localized name="sequencer-stop" />
        ) : (
          <Localized name="sequencer-play" />
        )}
      </ToolbarButton>
      <ToolbarButton
        type="button"
        accent="record"
        active={isRecording}
        onClick={toggleRecording}
      >
        <Localized name="sequencer-record" />
      </ToolbarButton>
      <ToolbarButton type="button" onClick={panic}>
        <Localized name="sequencer-panic" />
      </ToolbarButton>
      <div className="w-32">
        <Stepper
          label={localized["sequencer-tempo"]}
          value={patch.tempo}
          min={20}
          max={400}
          format={(value) => `${value} ${localized["sequencer-bpm"]}`}
          // typing "96", "96 BPM" or "96.4" all mean the same thing
          parse={(text) => {
            const number = Number.parseFloat(text.replace(/[^0-9.]/g, ""))
            return Number.isFinite(number) ? Math.round(number) : null
          }}
          onChange={(tempo) => editSequencer({ tempo }, "tempo")}
        />
      </div>
      <div className="flex items-center px-1 font-mono text-small text-fg-secondary">
        <Localized name="sequencer-step" />{" "}
        {isRecording ? target + 1 : position === null ? "–" : position + 1}
      </div>
    </div>
  )
}
