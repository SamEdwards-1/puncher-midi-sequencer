import styled from "@emotion/styled"
import { gridWidth, stepCount } from "@midiseq/core"
import { FC } from "react"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { useSelectedStep } from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { StepEditor } from "../StepEditor/StepEditor"
import { Panel, PanelHeader } from "../ui/Panel"

// The centre column never scrolls as a whole: the grid shrinks to fit and
// the step editor scrolls on its own.
const CentrePanel = styled(Panel)`
  overflow: hidden;
`

/* Below the grid on a normal window; beside it once there is room, so the
   grid can use the full height. */
const Content = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;

  @media (min-width: 2000px) {
    flex-direction: row;
  }
`

const GridColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
`

const GridArea = styled.div`
  flex: 1 1 auto;
  min-height: 6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1rem;
  overflow: hidden;
`

// A square that takes the smaller of the space's width and height, so the
// whole grid is always visible and the cells stay round.
const Grid = styled.div<{ columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ columns }) => columns}, minmax(0, 1fr));
  grid-template-rows: repeat(${({ columns }) => columns}, minmax(0, 1fr));
  gap: 0.4rem;
  aspect-ratio: 1;
  height: 100%;
  max-height: 100%;
  max-width: 100%;
`

const StepEditorArea = styled.div`
  flex: 0 0 auto;
  /* never more than it needs, so the grid keeps the rest */
  max-height: min(45%, 24rem);
  overflow-y: auto;
  border-top: 1px solid var(--color-divider);

  @media (min-width: 2000px) {
    width: 24rem;
    max-height: none;
    border-top: none;
    border-left: 1px solid var(--color-divider);
  }
`

const Step = styled.button`
  aspect-ratio: 1;
  min-width: 1.25rem;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--color-step);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  /* grows a little with the grid, without ever dominating the cell */
  font-size: clamp(0.6rem, 1.1vmin, 0.85rem);
  cursor: pointer;

  &[data-has-notes="true"] {
    background: var(--color-background-secondary);
    color: var(--color-text);
  }

  &[data-active="true"] {
    background: var(--color-theme);
    color: var(--color-on-surface);
  }

  &[data-selected="true"] {
    border-color: var(--color-text-secondary);
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
  const [selected, setSelected] = useSelectedStep()

  const onStepClick = (index: number) => {
    // a click always selects the step and sounds it, so it can be seen and
    // heard while editing
    setSelected(index)
    player.previewStep(index)
    // while playing, it also queues the step; otherwise it moves the record
    // target
    if (!isRecording && player.isPlaying) {
      player.queueStep(index)
      return
    }
    recorder.setTarget(index)
  }

  return (
    <CentrePanel aria-label={localized["sequencer-grid"]}>
      <PanelHeader>
        <Localized name="sequencer-grid" />
      </PanelHeader>
      <Content>
        <GridColumn>
          <GridArea>
            <Grid columns={gridWidth(size)}>
              {Array.from({ length: stepCount(size) }, (_, index) => (
                <Step
                  // biome-ignore lint/suspicious/noArrayIndexKey: a step's index is its identity in the grid
                  key={index}
                  type="button"
                  aria-label={`${localized["sequencer-step"]} ${index + 1}`}
                  data-has-notes={filled[index] === "1"}
                  data-active={position === index}
                  data-selected={selected === index}
                  data-target={isRecording && target === index}
                  onClick={() => onStepClick(index)}
                >
                  {index + 1}
                </Step>
              ))}
            </Grid>
          </GridArea>
          <Actions>
            {actions.map((action) => (
              <ActionButton key={action} type="button">
                <Localized name={action} />
              </ActionButton>
            ))}
          </Actions>
        </GridColumn>
        <StepEditorArea>
          <StepEditor />
        </StepEditorArea>
      </Content>
    </CentrePanel>
  )
}
