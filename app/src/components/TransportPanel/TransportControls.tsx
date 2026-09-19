import styled from "@emotion/styled"
import { FC } from "react"
import { useMobxSelector } from "../../hooks/useMobxSelector"
import { usePlayer } from "../../hooks/usePlayer"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"
import { Button } from "../ui/Button"

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const Readout = styled.div`
  min-width: 4.5rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-secondary);
`

export const TransportControls: FC = () => {
  const { isPlaying, position, play, stop, panic } = usePlayer()
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
      <Button type="button" onClick={panic}>
        <Localized name="sequencer-panic" />
      </Button>
      <Readout>
        {tempo} <Localized name="sequencer-bpm" />
      </Readout>
      <Readout>
        <Localized name="sequencer-step" />{" "}
        {position === null ? "–" : position + 1}
      </Readout>
    </Controls>
  )
}
