import styled from "@emotion/styled"
import { FC } from "react"
import { useMobxSelector } from "../../hooks/useMobxSelector"
import { usePlayer } from "../../hooks/usePlayer"
import { useRecorder } from "../../hooks/useRecorder"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"
import { Button } from "../ui/Button"

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const RecordButton = styled(Button)`
  &[data-active="true"] {
    background: var(--color-record);
    color: var(--color-on-surface);
  }
`

const Readout = styled.div`
  min-width: 4.5rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
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
      <Button
        type="button"
        data-active={isPlaying}
        onClick={isPlaying ? stop : play}
      >
        {isPlaying ? (
          <Localized name="sequencer-stop" />
        ) : (
          <Localized name="sequencer-play" />
        )}
      </Button>
      <RecordButton
        type="button"
        data-active={isRecording}
        onClick={toggleRecording}
      >
        <Localized name="sequencer-record" />
      </RecordButton>
      <Button type="button" onClick={panic}>
        <Localized name="sequencer-panic" />
      </Button>
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
