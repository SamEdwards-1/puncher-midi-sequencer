import { gridWidth, stepCount } from "@midiseq/core"
import {
  CSSProperties,
  FC,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { usePatchEditor } from "../../actions/patch"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import {
  useGridLanding,
  useGridMode,
  usePreviewOnClick,
  useSelectedStep,
} from "../../hooks/useSequencerView"
import { useStepMidiDrag } from "../../hooks/useStepMidiDrag"
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

// A landing wave is over in 0.6s: each step's bounce takes 360ms, and the
// steps start one after another across the 240ms left, so on a big grid
// they overlap closely and on a small one less so. styles.css holds the
// bounce's own length.
const LAND_MS = 360
const LAND_TOTAL_MS = 600

/**
 * The class that sets the steps bouncing in, from each import until the
 * wave is over, and the gap between one step starting and the next. Each
 * import takes the other of two classes: an animation starts again when its
 * name changes, so one import following another mid-wave starts it over.
 * Only an import made while the grid is shown sets it off.
 */
const useLanding = (count: number) => {
  const landing = useGridLanding()
  // an import from before the grid was shown — in another tab, say — has
  // already landed
  const shownAt = useRef(landing)
  const [on, setOn] = useState(false)
  const gap = (LAND_TOTAL_MS - LAND_MS) / Math.max(1, count - 1)
  useEffect(() => {
    if (landing === shownAt.current) {
      return
    }
    setOn(true)
    const done = setTimeout(() => setOn(false), LAND_TOTAL_MS + 50)
    return () => clearTimeout(done)
  }, [landing])
  return {
    className: on
      ? landing % 2 === 0
        ? "step-land"
        : "step-land-again"
      : null,
    gap,
  }
}

// The smallest the grid shrinks to as the column scrolls: eight steps of
// about 26px, still big enough to hit and read.
const MIN_GRID = 208
// room above and below the grid
const GRID_PAD = 12
// the share of the column's height the grid starts at, so the editors below
// it are in view from the first
const START_SHARE = 0.6

const useSize = (ref: RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    if (typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

// `className` sizes the panel where it sits in a tab rather than a column.
export const SequenceGrid: FC<{ className?: string }> = ({ className }) => {
  const { sequencerStore, player, recorder } = useStores()
  const localized = useLocalization()
  const { editJump, editStepState } = usePatchEditor()
  const [mode, setMode] = useGridMode()
  const [preview, setPreview] = usePreviewOnClick()
  // a step dragged out of the browser lands as its MIDI file
  const dragStep = useStepMidiDrag()

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
  const landing = useLanding(stepCount(size))

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

  /**
   * The column scrolls as one, with the grid stuck to its top. The grid's
   * layer keeps its full height in the layout while the grid inside it
   * shrinks by as much as the column has scrolled, so the editors below
   * follow its bottom edge up; once it is down to its smallest they carry on
   * underneath it. The scroll goes to a CSS variable rather than to React,
   * so scrolling never re-renders the steps.
   */
  const scroller = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(scroller)
  const fullGrid = Math.max(
    MIN_GRID,
    Math.min(width - 32, height * START_SHARE - 2 * GRID_PAD),
  )
  const fullLayer = fullGrid + 2 * GRID_PAD
  const smallestLayer = MIN_GRID + 2 * GRID_PAD
  const onScroll = () => {
    const element = scroller.current
    element?.style.setProperty("--grid-scroll", `${element.scrollTop}px`)
  }

  return (
    <Panel
      aria-label={localized["sequencer-grid"]}
      className={cn("overflow-hidden", className)}
    >
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
      <div
        ref={scroller}
        data-grid-scroller
        className="min-h-0 flex-1 overflow-y-auto"
        style={
          {
            "--grid-scroll": "0px",
            // what focus scrolls to lands below the grid, not under it
            scrollPaddingTop: smallestLayer,
          } as CSSProperties
        }
        onScroll={onScroll}
      >
        {/* the grid's layer: its full height in the layout, see-through and
            unclickable below the grid, so the editors show and work there */}
        <div
          className="pointer-events-none sticky top-0 z-10"
          style={{ height: fullLayer }}
        >
          <div
            data-grid-frame
            // without Preflight, padding would add to the height it is given
            className="pointer-events-auto box-border flex items-center justify-center bg-background px-4 shadow-[0_1px_0_var(--midiseq-divider)]"
            style={{
              height: `max(${smallestLayer}px, ${fullLayer}px - var(--grid-scroll))`,
              paddingBlock: GRID_PAD,
            }}
          >
            {/* A square as tall as the frame allows, so the cells stay round
                however far the grid has shrunk. */}
            <div
              className="grid aspect-square h-full max-w-full gap-[0.4rem]"
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
                      landing.className,
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
                        animationDelay:
                          landing.className === null
                            ? undefined
                            : `${index * landing.gap}ms`,
                      } as CSSProperties
                    }
                    onClick={() => onStepClick(index)}
                    draggable
                    onDragStart={(event) => dragStep(index, event)}
                  >
                    {index + 1}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {/* no taller than it is, so the scroll ends with the editor's
            bottom at the window's; the grid shrinks as far as that allows */}
        <div>
          <ActionButtons />
          <StepEditor />
        </div>
      </div>
    </Panel>
  )
}
