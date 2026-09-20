import styled from "@emotion/styled"
import { gridWidth, stepCount } from "@midiseq/core"
import { FC } from "react"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Panel, PanelBody, PanelHeader } from "../ui/Panel"

const Grid = styled.div<{ columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ columns }) => columns}, 1fr);
  gap: 0.4rem;
  padding: 0.75rem 1rem;
`

const Step = styled.button`
  aspect-ratio: 1;
  min-width: 1.5rem;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--color-step);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  cursor: pointer;

  &[data-has-notes="true"] {
    background: var(--color-background-secondary);
    color: var(--color-text);
  }

  &[data-active="true"] {
    background: var(--color-theme);
    color: var(--color-on-surface);
  }

  &[data-target="true"] {
    border-color: var(--color-record);
  }
`

const Actions = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-divider);
`

const ActionButton = styled.button`
  min-width: 5rem;
  height: 2rem;
  border: none;
  border-radius: 1rem;
  background: var(--color-background-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    background: var(--color-highlight);
  }
`

const actions = [
  "sequencer-action-hang",
  "sequencer-action-bump",
  "sequencer-action-flip",
  "sequencer-action-shift",
] as const

export const SequenceGrid: FC = () => {
  const { sequencerStore, player, recorder } = useStores()
  const localized = useLocalization()

  const size = useMobxSelector(
    () => sequencerStore.patch.size,
    [sequencerStore],
  )
  // a compact signature so the grid only re-renders when a step gains or
  // loses notes
  const filled = useMobxSelector(
    () =>
      sequencerStore.patch.steps
        .map((step) => (step.notes.length > 0 ? "1" : "0"))
        .join(""),
    [sequencerStore],
  )
  const position = useMobxGetter(player, "position")
  const target = useMobxGetter(recorder, "target")
  const isRecording = useMobxGetter(recorder, "isRecording")

  const onStepClick = (index: number) => {
    // while playing, a click queues the step; otherwise it moves the record
    // target
    if (!isRecording && player.isPlaying) {
      player.queueStep(index)
      return
    }
    recorder.setTarget(index)
  }

  return (
    <Panel>
      <PanelHeader>
        <Localized name="sequencer-grid" />
      </PanelHeader>
      <Grid columns={gridWidth(size)}>
        {Array.from({ length: stepCount(size) }, (_, index) => (
          <Step
            // biome-ignore lint/suspicious/noArrayIndexKey: a step's index is its identity in the grid
            key={index}
            type="button"
            aria-label={`${localized["sequencer-step"]} ${index + 1}`}
            data-has-notes={filled[index] === "1"}
            data-active={position === index}
            data-target={isRecording && target === index}
            onClick={() => onStepClick(index)}
          >
            {index + 1}
          </Step>
        ))}
      </Grid>
      <PanelHeader>
        <Localized name="sequencer-step-editor" />
      </PanelHeader>
      <PanelBody />
      <Actions>
        {actions.map((action) => (
          <ActionButton key={action} type="button">
            <Localized name={action} />
          </ActionButton>
        ))}
      </Actions>
    </Panel>
  )
}
