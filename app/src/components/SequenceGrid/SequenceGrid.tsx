import { useTheme } from "@emotion/react"
import styled from "@emotion/styled"
import { gridWidth, stepCount } from "@midiseq/core"
import { CSSProperties, FC } from "react"
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

  /* A jump shows as a pair sharing a colour: the source is marked at the
     north-east, its destination at the south-west. */
  &[data-jump-source]::after {
    content: "";
    position: absolute;
    right: 10%;
    top: 10%;
    width: 0.32rem;
    height: 0.32rem;
    border-radius: 50%;
    background: var(--jump-source-color);
  }

  &[data-jump-dest]::before {
    content: "";
    position: absolute;
    left: 10%;
    bottom: 10%;
    width: 0.32rem;
    height: 0.32rem;
    border-radius: 50%;
    background: var(--jump-dest-color);
  }
`

export const SequenceGrid: FC = () => {
  const { sequencerStore, player, recorder } = useStores()
  const localized = useLocalization()
  const { editJump, editStepState } = usePatchEditor()
  const [mode, setMode] = useGridMode()
  const theme = useTheme()

  const size = useMobxSelector(
    () => sequencerStore.patch.size,
    [sequencerStore],
  )
  /**
   * What each cell draws, as a compact signature so the grid only re-renders
   * when it changes. Each jump takes the next colour in the palette, and its
   * source and destination both carry it. A step targeted by several jumps
   * shows the first one's colour.
   */
  const marks = useMobxSelector(() => {
    const steps = sequencerStore.patch.steps
    const source: (number | null)[] = steps.map(() => null)
    const dest: (number | null)[] = steps.map(() => null)
    let next = 0
    steps.forEach((step, index) => {
      if (step.jump.dest === null) {
        return
      }
      const colour = next++
      source[index] = colour
      dest[step.jump.dest] ??= colour
    })
    return steps
      .map(
        (step, index) =>
          `${step.notes.length > 0 ? "n" : "-"}${step.state[0]}${
            source[index] ?? "-"
          }${dest[index] ?? "-"}`,
      )
      .join(",")
  }, [sequencerStore]).split(",")

  const jumpColour = (mark: string) =>
    mark === "-"
      ? undefined
      : theme.jumpColors[Number(mark) % theme.jumpColors.length]
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
              {Array.from({ length: stepCount(size) }, (_, index) => {
                const mark = marks[index]
                const sourceColour = jumpColour(mark[2])
                const destColour = jumpColour(mark[3])
                return (
                  <Step
                    // biome-ignore lint/suspicious/noArrayIndexKey: a step's index is its identity in the grid
                    key={index}
                    type="button"
                    aria-label={`${localized["sequencer-step"]} ${index + 1}`}
                    data-has-notes={mark[0] === "n"}
                    data-state={
                      mark[1] === "r"
                        ? "rest"
                        : mark[1] === "s"
                          ? "skip"
                          : "normal"
                    }
                    data-jump-source={sourceColour}
                    data-jump-dest={destColour}
                    data-active={position === index}
                    data-selected={selected === index}
                    data-target={isRecording && target === index}
                    style={
                      {
                        "--jump-source-color": sourceColour,
                        "--jump-dest-color": destColour,
                      } as CSSProperties
                    }
                    onClick={() => onStepClick(index)}
                  >
                    {index + 1}
                  </Step>
                )
              })}
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
