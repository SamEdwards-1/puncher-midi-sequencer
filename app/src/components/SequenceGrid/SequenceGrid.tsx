import styled from "@emotion/styled"
import { gridWidth, stepCount } from "@midiseq/core"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { useGridMode, useSelectedStep } from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { StepEditor } from "../StepEditor/StepEditor"
import { Panel, PanelHeader } from "../ui/Panel"
import { ActionButtons } from "./ActionButtons"

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
  position: relative;
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

  &[data-state="rest"] {
    background: var(--color-step-rest);
  }

  &[data-state="skip"] {
    background: var(--color-step-skip);
    color: var(--color-text-tertiary);
  }

  /* a step that jumps somewhere carries a small mark */
  &[data-jump="true"]::after {
    content: "";
    position: absolute;
    right: 12%;
    top: 12%;
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    background: var(--color-yellow);
  }
`

export const SequenceGrid: FC = () => {
  const { sequencerStore, player, recorder } = useStores()
  const localized = useLocalization()
  const { editJump, editStepState } = usePatchEditor()
  const [mode, setMode] = useGridMode()

  const size = useMobxSelector(
    () => sequencerStore.patch.size,
    [sequencerStore],
  )
  // a compact signature, so the grid only re-renders when what it draws
  // actually changes: notes, state and whether a step has a jump
  const marks = useMobxSelector(
    () =>
      sequencerStore.patch.steps
        .map(
          (step) =>
            `${step.notes.length > 0 ? "n" : "-"}${step.state[0]}${
              step.jump.dest === null ? "-" : "j"
            }`,
        )
        .join(","),
    [sequencerStore],
  ).split(",")
  const position = useMobxGetter(player, "position")
  const target = useMobxGetter(recorder, "target")
  const isRecording = useMobxGetter(recorder, "isRecording")
  const [selected, setSelected] = useSelectedStep()

  const onStepClick = (index: number) => {
    // a mode takes over the click: set a jump target, or mark rests and skips
    if (mode === "dest" || mode === "normal") {
      editJump(selected, { [mode]: index })
      setMode(null)
      return
    }
    if (mode === "rest" || mode === "skip") {
      const current = sequencerStore.patch.steps[index].state
      editStepState(index, current === mode ? "normal" : mode)
      return
    }

    // otherwise a click selects the step and sounds it, so it can be seen and
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
                  data-has-notes={marks[index][0] === "n"}
                  data-state={
                    marks[index][1] === "r"
                      ? "rest"
                      : marks[index][1] === "s"
                        ? "skip"
                        : "normal"
                  }
                  data-jump={marks[index][2] === "j"}
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
          <ActionButtons />
        </GridColumn>
        <StepEditorArea>
          <StepEditor />
        </StepEditorArea>
      </Content>
    </CentrePanel>
  )
}
