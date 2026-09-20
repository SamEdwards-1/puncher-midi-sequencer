import styled from "@emotion/styled"
import { FC } from "react"
import { useMobxSelector } from "../../hooks/useMobxSelector"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"
import { ToolbarButton } from "../ui/Button"

const Controls = styled.div`
  display: flex;
  align-self: stretch;
`

const RecordButton = styled(ToolbarButton)`
  &[data-active="true"] {
    color: var(--color-record);
    border-top-color: var(--color-record);
  }
`

const Readout = styled.div`
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
`

export const TransportControls: FC = () => {
  const { isPlaying, position, play, stop, panic } = usePlayer()
  const { isRecording, target, toggleRecording } = useRecorder()
  const { sequencerStore } = useStores()
  const tempo = useMobxSelector(
    () => sequencerStore.patch.tempo,
    [sequencerStore],
  )

  return (
    <Controls>
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
      <Readout>
        {tempo} <Localized name="sequencer-bpm" />
      </Readout>
      <Readout>
        <Localized name="sequencer-step" />{" "}
        {isRecording ? target + 1 : position === null ? "–" : position + 1}
      </Readout>
    </Controls>
  )
}
