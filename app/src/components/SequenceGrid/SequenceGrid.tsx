import { gridWidth, stepCount } from "@midiseq/core"
import { CSSProperties, FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import {
  useGridMode,
  usePreviewOnClick,
  useSelectedStep,
} from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { StepEditor } from "../StepEditor/StepEditor"
import { cn } from "../ui/cn"
import { Panel, PanelHeader } from "../ui/Panel"
import { Toggle } from "../ui/Toggle"
import { ActionButtons } from "./ActionButtons"

const STEP =
  "relative aspect-square min-w-[1.25rem] rounded-full border-2 font-mono text-[clamp(0.6rem,1.1vmin,0.85rem)]"

/* A jump shows as a pair sharing a colour: the source is marked at the
   north-east, its destination at the south-west. */
const SOURCE_MARK =
  "after:absolute after:top-[10%] after:right-[10%] after:h-[0.32rem] after:w-[0.32rem] after:rounded-full after:bg-[var(--jump-source-color)] after:content-['']"

const DEST_MARK =
  "before:absolute before:bottom-[10%] before:left-[10%] before:h-[0.32rem] before:w-[0.32rem] before:rounded-full before:bg-[var(--jump-dest-color)] before:content-['']"

const JUMP_COLOURS = 8

export const SequenceGrid: FC = () => {
  const { sequencerStore, player, recorder } = useStores()
  const localized = useLocalization()
  const { editJump, editStepState } = usePatchEditor()
  const [mode, setMode] = useGridMode()
  const [preview, setPreview] = usePreviewOnClick()

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

  // which of the palette's colours the mark stands for, if any
  const jumpColour = (mark: string) =>
    mark === "-" ? undefined : Number(mark) % JUMP_COLOURS

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

    // otherwise a click selects the step, and sounds it when preview is on
    setSelected(index)
    if (preview) {
      player.previewStep(index)
    }
    // while playing, it also queues the step; otherwise it moves the record
    // target
    if (!isRecording && player.isPlaying) {
      player.queueStep(index)
      return
    }
    recorder.setTarget(index)
  }

  const columns = gridWidth(size)

  return (
    // The centre column never scrolls as a whole: the grid shrinks to fit and
    // the step editor scrolls on its own.
    <Panel aria-label={localized["sequencer-grid"]} className="overflow-hidden">
      <PanelHeader className="flex items-center gap-2">
        <span className="grow">
          <Localized name="sequencer-grid" />
        </span>
        <span className="flex items-center gap-[0.4rem] text-small font-normal text-fg-secondary">
          <Localized name="sequencer-preview" />
          <Toggle
            label={localized["sequencer-preview"]}
            checked={preview}
            onChange={setPreview}
          />
        </span>
      </PanelHeader>
      {/* Below the grid on a normal window; beside it once there is room, so
          the grid can use the full height. */}
      <div className="flex min-h-0 flex-1 flex-col wide:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-[6rem] flex-1 items-center justify-center overflow-hidden px-4 py-3">
            {/* A square that takes the smaller of the space's width and
                height, so the whole grid is always visible and the cells stay
                round. */}
            <div
              className="grid aspect-square h-full max-h-full max-w-full gap-[0.4rem]"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: stepCount(size) }, (_, index) => {
                const mark = marks[index]
                const source = jumpColour(mark[2])
                const dest = jumpColour(mark[3])
                const state =
                  mark[1] === "r" ? "rest" : mark[1] === "s" ? "skip" : "normal"
                const hasNotes = mark[0] === "n"
                const active = position === index
                return (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: a step's index is its identity in the grid
                    key={index}
                    type="button"
                    aria-label={`${localized["sequencer-step"]} ${index + 1}`}
                    data-has-notes={hasNotes}
                    data-state={state}
                    data-jump-source={source}
                    data-jump-dest={dest}
                    data-active={active}
                    data-selected={selected === index}
                    data-target={isRecording && target === index}
                    className={cn(
                      STEP,
                      state === "skip"
                        ? "bg-step-skip text-fg-tertiary"
                        : cn(
                            state === "rest"
                              ? "bg-step-rest"
                              : active
                                ? "bg-theme"
                                : hasNotes
                                  ? "bg-background-secondary"
                                  : "bg-step",
                            active
                              ? "text-on-surface"
                              : hasNotes
                                ? "text-fg"
                                : "text-fg-secondary",
                          ),
                      isRecording && target === index
                        ? "border-record"
                        : selected === index
                          ? "border-fg-secondary"
                          : "border-transparent",
                      source !== undefined && SOURCE_MARK,
                      dest !== undefined && DEST_MARK,
                    )}
                    style={
                      {
                        "--jump-source-color":
                          source === undefined
                            ? undefined
                            : `var(--midiseq-jump-${source})`,
                        "--jump-dest-color":
                          dest === undefined
                            ? undefined
                            : `var(--midiseq-jump-${dest})`,
                      } as CSSProperties
                    }
                    onClick={() => onStepClick(index)}
                  >
                    {index + 1}
                  </button>
                )
              })}
            </div>
          </div>
          <ActionButtons />
        </div>
        <div className="max-h-[min(45%,24rem)] flex-none overflow-y-auto border-t border-divider wide:max-h-none wide:w-96 wide:border-t-0 wide:border-l">
          <StepEditor />
        </div>
      </div>
    </Panel>
  )
}
