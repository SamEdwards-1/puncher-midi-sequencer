import { gridRows, gridWidth, stepCount } from "@midiseq/core"
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
import { menuPoint, Point } from "../ui/Menu"
import { Panel, PanelHeader } from "../ui/Panel"
import { Toggle } from "../ui/Toggle"
import { ActionButtons, ActionIcons } from "./ActionButtons"
import { PatchName } from "./PatchName"
import { StepMenu } from "./StepMenu"

const STEP =
  "relative aspect-square min-w-[1.25rem] rounded-full border-2 font-mono text-[clamp(0.6rem,1.1vmin,0.85rem)]"

/* A jump shows as a pair sharing a colour: the source is marked at the
   north-east, its destination at the south-west, each just outside the
   circle so it never crowds the number however small the step gets. The
   mark's centre sits on the diagonal, the circle's radius (half the padding
   box plus the 2px border) and a gap away from the middle. */
const SOURCE_MARK =
  "after:absolute after:top-[calc(50%_-_(50%_+_2px_+_0.22rem)_*_0.7071_-_0.16rem)] after:left-[calc(50%_+_(50%_+_2px_+_0.22rem)_*_0.7071_-_0.16rem)] after:h-[0.32rem] after:w-[0.32rem] after:rounded-full after:bg-[var(--jump-source-color)] after:content-['']"

const DEST_MARK =
  "before:absolute before:top-[calc(50%_+_(50%_+_2px_+_0.22rem)_*_0.7071_-_0.16rem)] before:left-[calc(50%_-_(50%_+_2px_+_0.22rem)_*_0.7071_-_0.16rem)] before:h-[0.32rem] before:w-[0.32rem] before:rounded-full before:bg-[var(--jump-dest-color)] before:content-['']"

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

interface Arrival {
  delay: number
  // the growth that brought the step in, so an earlier one's end leaves it
  growth: number
}

/**
 * The steps a larger size has just brought onto the grid, each with the
 * delay its bounce waits: they land as an import's do, in a wave of their
 * own, so a drag that adds them one at a time bounces each as it comes. A
 * step keeps its bounce until it is over, however the size moves meanwhile.
 * The grid's own layout effect sets them, so a step never shows unbounced.
 */
const useArrivals = (count: number): ReadonlyMap<number, Arrival> => {
  const shown = useRef(count)
  const growths = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const [arrivals, setArrivals] = useState<ReadonlyMap<number, Arrival>>(
    () => new Map(),
  )
  useLayoutEffect(() => {
    const from = shown.current
    shown.current = count
    if (count <= from) {
      return
    }
    const growth = ++growths.current
    const gap = (LAND_TOTAL_MS - LAND_MS) / Math.max(1, count - from - 1)
    setArrivals((current) => {
      const next = new Map(current)
      for (let index = from; index < count; index++) {
        next.set(index, { delay: (index - from) * gap, growth })
      }
      return next
    })
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setArrivals((current) => {
        const next = new Map(current)
        for (const [index, arrival] of current) {
          if (arrival.growth === growth) {
            next.delete(index)
          }
        }
        return next
      })
    }, LAND_TOTAL_MS + 50)
    timers.current.add(timer)
  }, [count])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) {
        clearTimeout(timer)
      }
    }
  }, [])
  return arrivals
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
   * when it changes. A jump's colour comes from the step it leaves, so adding
   * another never recolours the rest, and its source and destination both
   * carry it. A step targeted by several jumps shows the first one's colour.
   */
  const marks = useMobxSelector(() => {
    const steps = sequencerStore.patch.steps
    const source: (number | null)[] = steps.map(() => null)
    const dest: (number | null)[] = steps.map(() => null)
    steps.forEach((step, index) => {
      if (step.jump.dest === null) {
        return
      }
      const colour = index % JUMP_COLOURS
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
  const jumpColour = (mark: string) => (mark === "-" ? undefined : Number(mark))

  const position = useMobxGetter(player, "position")
  const target = useMobxGetter(recorder, "target")
  const isRecording = useMobxGetter(recorder, "isRecording")
  const [selected, setSelected] = useSelectedStep()
  const landing = useLanding(stepCount(size))
  const arrivals = useArrivals(stepCount(size))

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

  // the step whose menu a right-click opened, and where
  const [menu, setMenu] = useState<{ index: number; at: Point } | null>(null)

  const columns = gridWidth(size)
  const rows = gridRows(size)

  /**
   * The column scrolls as one, with the grid stuck to its top. The grid's
   * layer keeps its full height in the layout while the grid inside it
   * shrinks by as much as the column has scrolled, so the editors below
   * follow its bottom edge up; once it is down to its smallest they carry on
   * underneath it. The scroll goes to a CSS variable rather than to React,
   * so scrolling never re-renders the steps, and on the grid's frame rather
   * than the column, so it restyles the grid alone.
   *
   * The envelope editor ends the column. Scrolled on once it is all in view,
   * it grows rather than moving, its bottom staying at the window's, until
   * the step editor is under the grid and it fills the view below.
   */
  const scroller = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(scroller)
  const fullGrid = Math.max(
    MIN_GRID,
    Math.min(width - 32, height * START_SHARE - 2 * GRID_PAD),
  )
  const fullLayer = fullGrid + 2 * GRID_PAD
  const smallestLayer = MIN_GRID + 2 * GRID_PAD
  const column = { scroller, view: Math.max(0, height - smallestLayer) }
  // Once the action buttons are mostly under the grid, their icons drop
  // into the title bar instead.
  const frame = useRef<HTMLDivElement>(null)
  const actionRow = useRef<HTMLDivElement>(null)
  const [actionsAway, setActionsAway] = useState(false)
  const onScroll = () => {
    frame.current?.style.setProperty(
      "--grid-scroll",
      `${scroller.current?.scrollTop ?? 0}px`,
    )
    const row = actionRow.current?.getBoundingClientRect()
    const grid = frame.current?.getBoundingClientRect()
    if (row !== undefined && grid !== undefined) {
      setActionsAway(row.top + row.height / 2 < grid.bottom)
    }
  }

  return (
    <Panel
      aria-label={localized["sequencer-grid"]}
      className={cn("overflow-hidden", className)}
    >
      {/* three columns, the outer two equal, so the action icons sit in the
          middle of the bar */}
      <PanelHeader className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 overflow-hidden">
        <span className="min-w-0">
          <PatchName />
        </span>
        <ActionIcons shown={actionsAway} />
        <span className="flex items-center justify-end gap-[0.4rem] text-small font-normal text-fg-secondary">
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
        // what focus scrolls to lands below the grid, not under it
        style={{ scrollPaddingTop: smallestLayer }}
        onScroll={onScroll}
      >
        {/* the grid's layer: its full height in the layout, see-through and
            unclickable below the grid, so the editors show and work there */}
        <div
          className="pointer-events-none sticky top-0 z-10"
          style={{ height: fullLayer }}
        >
          <div
            ref={frame}
            data-grid-frame
            // without Preflight, padding would add to the height it is given
            className="pointer-events-auto box-border flex items-center justify-center bg-background px-4 shadow-[0_1px_0_var(--midiseq-divider)]"
            style={
              {
                "--grid-scroll": "0px",
                height: `max(${smallestLayer}px, ${fullLayer}px - var(--grid-scroll))`,
                paddingBlock: GRID_PAD,
              } as CSSProperties
            }
          >
            {/* A square as tall as the frame allows, so the cells stay round
                however far the grid has shrunk. A grid a row short of
                square sits in its middle. */}
            <div
              className="grid aspect-square h-full max-w-full content-center gap-[0.4rem]"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, auto)`,
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
                const arrival = arrivals.get(index)
                const bounce =
                  arrival === undefined
                    ? landing.className === null
                      ? null
                      : {
                          className: landing.className,
                          delay: index * landing.gap,
                        }
                    : { className: "step-land", delay: arrival.delay }
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
                      bounce?.className,
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
                          bounce === null ? undefined : `${bounce.delay}ms`,
                      } as CSSProperties
                    }
                    onClick={() => onStepClick(index)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setSelected(index)
                      setMenu({ index, at: menuPoint(event) })
                    }}
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
        {/* no taller than it is, the envelope editor's room to grow at its
            end included, so the scroll ends with the step editor under the
            grid at its smallest and the envelope editor filling the view */}
        <div>
          <div ref={actionRow}>
            <ActionButtons />
          </div>
          <StepEditor column={column} />
        </div>
      </div>
      {menu !== null && (
        <StepMenu
          index={menu.index}
          at={menu.at}
          onClose={() => setMenu(null)}
        />
      )}
    </Panel>
  )
}
