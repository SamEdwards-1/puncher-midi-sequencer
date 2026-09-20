import styled from "@emotion/styled"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useHistory } from "../../hooks/useHistory"
import { usePatch } from "../../hooks/usePatch"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { ToolbarButton } from "../ui/Button"
import { Stepper } from "../ui/Stepper"

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const RecordButton = styled(ToolbarButton)`
  &[data-active="true"] {
    background: var(--color-record);
    color: var(--color-on-surface);
  }
`

const Tempo = styled.div`
  width: 8rem;
`

const Readout = styled.div`
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
`

export const TransportControls: FC = () => {
  const { isPlaying, position, play, stop, panic } = usePlayer()
  const { isRecording, target, toggleRecording } = useRecorder()
  const { canUndo, canRedo, undo, redo } = useHistory()
  const { editSequencer } = usePatchEditor()
  const localized = useLocalization()
  const patch = usePatch()

  return (
    <Controls>
      <ToolbarButton type="button" disabled={!canUndo} onClick={undo}>
        <Localized name="sequencer-undo" />
      </ToolbarButton>
      <ToolbarButton type="button" disabled={!canRedo} onClick={redo}>
        <Localized name="sequencer-redo" />
      </ToolbarButton>
      <ToolbarButton
        type="button"
        data-active={isPlaying}
        onClick={isPlaying ? stop : play}
      >
        {isPlaying ? (
          <Localized name="sequencer-stop" />
        ) : (
          <Localized name="sequencer-play" />
        )}
      </ToolbarButton>
      <RecordButton
        type="button"
        data-active={isRecording}
        onClick={toggleRecording}
      >
        <Localized name="sequencer-record" />
      </RecordButton>
      <ToolbarButton type="button" onClick={panic}>
        <Localized name="sequencer-panic" />
      </ToolbarButton>
      <Tempo>
        <Stepper
          label={localized["sequencer-tempo"]}
          value={patch.tempo}
          min={20}
          max={400}
          format={(value) => `${value} ${localized["sequencer-bpm"]}`}
          onChange={(tempo) => editSequencer({ tempo }, "tempo")}
        />
      </Tempo>
      <Readout>
        <Localized name="sequencer-step" />{" "}
        {isRecording ? target + 1 : position === null ? "–" : position + 1}
      </Readout>
    </Controls>
  )
}
