import {
  addEnvelope,
  ENVELOPE_MAX_VALUE,
  EnvelopeJSON,
  EnvelopePointJSON,
  EnvelopeShape,
  envelopeShape,
  gridTimes,
  inModulationRange,
  insertPoint,
  insertPointOnLine,
  ModulationJSON,
  modulationCC,
  modulationForCC,
  modulationStops,
  modulationValueAt,
  movePoint,
  moveSegment,
  nextEnvelopeId,
  paceBeats,
  paintPoints,
  removePoint,
  setDotVelocity,
  settingValue,
  snapTime,
  snapToModulation,
  stairsFor,
  stepPace,
  toBeatTimes,
  toStepTimes,
  updateEnvelope,
  VoiceIndex,
  valueAt,
} from "@midiseq/core"
import UnfoldLessHorizontalIcon from "mdi-react/UnfoldLessHorizontalIcon"
import UnfoldMoreHorizontalIcon from "mdi-react/UnfoldMoreHorizontalIcon"
import {
  FC,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { usePatchGesture } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { usePatch } from "../../hooks/usePatch"
import { useEnvelopeGrid, useEnvelopeTool } from "../../hooks/useSequencerView"
import { useStepPreview } from "../../hooks/useStepPreview"
import { useStores } from "../../hooks/useStores"
import { useLocalization } from "../../localize/useLocalization"
import { modulationValueLabel } from "../Modulation/labels"
import { IconButton } from "../ui/Button"
import { EnvelopeRuler, RULER_HEIGHT } from "./EnvelopeRuler"
import {
  areaPath,
  cellAt,
  hitPoint,
  hitSegment,
  isBlackKey,
  linePath,
  Plot,
  pianoRows,
  stepCorners,
  timeAtX,
  toX,
  toY,
  View,
  valueAtY,
  WHOLE_STEP,
} from "./envelopeGeometry"
import { observeDrag } from "./observeDrag"
import { PIANO_WIDTH, PianoKeys } from "./PianoKeys"
import { Playhead } from "./Playhead"
import { bandBeats } from "./rulerView"
import {
  dotKey,
  hitLollipop,
  pointsAlong,
  VelocityPoint,
  velocityPoints,
} from "./velocityLine"

/**
 * What the graph edits: one of the channel's CC envelopes, or the velocity
 * of the notes its voices play.
 */
export type GraphLane =
  | { kind: "cc"; envelope: EnvelopeJSON | null; cc: number; channel: number }
  | { kind: "velocity"; voice: VoiceIndex }

export const GRIDS = [
  { beats: 1, label: "1/4" },
  { beats: 0.5, label: "1/8" },
  { beats: 0.25, label: "1/16" },
  { beats: 0.125, label: "1/32" },
  { beats: 1 / 3, label: "1/8T" },
  { beats: 1 / 6, label: "1/16T" },
]

// the graph's own height; the column it scrolls in may give it more
export const GRAPH_HEIGHT = 240
const PAD = 6
// before the graph has been measured, and in tests
const FALLBACK_WIDTH = 480
// how far either side of a Draw press a note is caught
const REACH = 4
// a drag has to go this far sideways before a point leaves its time, so a
// straight drag up or down never nudges a point off the grid
const SIDEWAYS = 4
// grid lines closer than this are left out, though points still snap to them
const MIN_LINE_GAP = 4
const AXIS = [127, 96, 64, 32, 0]
// a point's square handle, this many pixels across
const HANDLE = 6
// A modulated setting's values down the right, no closer than this; the
// graph is ruled at each where they are no closer than the second.
const MIN_LABEL_GAP = 13
const MIN_GUIDE_GAP = 5
// the axis's numbers' width, and roughly a character's of its small mono
// font, to make room for a setting's names; a long one is cut short
const AXIS_WIDTH = 28
const AXIS_CHARACTER = 5.4
const MAX_AXIS_WIDTH = 116

// a square of `size` centred on (x, y)
const square = (x: number, y: number, size: number) => ({
  x: x - size / 2,
  y: y - size / 2,
  width: size,
  height: size,
})

const useWidth = (ref: RefObject<HTMLElement | null>, fallback: number) => {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width > 0 ? width : fallback
}

// a lollipop's head, this many pixels across
const HEAD = 7

/**
 * One note's velocity: a round head where it starts, at the height it plays,
 * and a stem held there for as long as it sounds, in its voice's colour. Only
 * the voice on show is given an index, and so can be picked out and edited.
 */
const Lollipop: FC<{
  plot: Plot
  point: VelocityPoint
  index?: number
  hovered?: boolean
}> = ({ plot, point, index, hovered = false }) => {
  const x = toX(plot, point.time)
  const y = toY(plot, point.value)
  const colour = `var(--midiseq-voice-${point.voice})`
  return (
    <g
      data-point={index}
      data-velocity={Math.round(point.value)}
      data-voice={point.voice}
    >
      <line
        data-stem
        x1={x}
        x2={Math.max(x, toX(plot, point.end))}
        y1={y}
        y2={y}
        stroke={colour}
        strokeWidth={hovered ? 2.5 : 1.5}
      />
      <circle
        cx={x}
        cy={y}
        r={(hovered ? HEAD + 2 : HEAD) / 2}
        fill={colour}
        stroke="var(--midiseq-background-dark)"
        strokeWidth={1}
      />
    </g>
  )
}

/**
 * The values of a modulated setting to name down the axis, as far apart as
 * `gap` needs: the first and last always, and every so many between, taken
 * from the first.
 */
const axisStops = (
  stops: { cc: number; label: string }[],
  spacing: number,
  gap: number,
) => {
  const every = Math.max(1, Math.ceil(gap / Math.max(spacing, 1e-9)))
  const last = stops.length - 1
  return stops.filter(
    (_, index) =>
      index === last ||
      (index % every === 0 && (last - index) * spacing >= gap),
  )
}

/**
 * One step's CC envelope, or its notes' velocities, over a piano roll of the
 * notes the step plays. The notes follow the voices — pace, pattern,
 * ratchets, length, rule — and can't be touched here.
 *
 * An envelope is edited as in Live, drawn as in Signal's control pane. Edit:
 * click the line to add a point on it, double-click anywhere to place one,
 * drag a point to move it, drag the line to raise or lower it, click a point
 * to delete it. Draw: drag to paint values across the grid. Points snap to
 * the grid unless Alt is held, and B switches between the two.
 *
 * Velocity is drawn as in Signal's velocity pane: a lollipop for each note,
 * its head where the note starts, as high as it plays, its stem as long as
 * the note sounds. The voice on show is in its colour and can be edited; the
 * others are dimmed behind it, to be seen and not touched. Dragging a head or
 * stem up or down sets the note's velocity, clicking a head returns its note
 * to the voice's, and Draw paints across them. A note's velocity is its dot's,
 * so every note from that dot moves with it, and one landing near an accent's
 * velocity makes that accent.
 *
 * A CC that modulates a setting reads down the right as the setting's
 * values, and its points snap to them, Alt or not; a dashed line marks the
 * setting's own value, which a step without the envelope plays.
 *
 * `height` is the roll's, below the ruler; taller, its rows and values are
 * spread further apart.
 */
export const EnvelopeGraph: FC<{
  step: number
  lane: GraphLane
  height?: number
}> = ({ step, lane, height = GRAPH_HEIGHT }) => {
  const patch = usePatch()
  const { sequencerStore } = useStores()
  const beginGesture = usePatchGesture()
  const [tool, setTool] = useEnvelopeTool()
  const [gridBeats] = useEnvelopeGrid()
  const { accentAmount } = useAccentAmount()
  const localized = useLocalization()
  const frame = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const width = useWidth(frame, FALLBACK_WIDTH)
  // the stretch of the step zoomed in on, from the ruler; kept from step to
  // step, as they all share one pace
  const [view, setView] = useState<View>(WHOLE_STEP)
  // the time the ruler was pressed on, ruled through the roll while it drags
  const [mark, setMark] = useState<number | null>(null)
  const viewLength = view.end - view.start
  const plot: Plot = { width, height, pad: PAD, view }
  const [hover, setHover] = useState<{
    point: number | null
    segment: number | null
  }>({ point: null, segment: null })
  // where the mouse is over the graph, for the value readout
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const envelope = lane.kind === "cc" ? lane.envelope : null
  // A velocity line runs from note to note; an envelope has its own shape,
  // and one about to be drawn onto the step will step, as new ones do.
  const shape: EnvelopeShape =
    lane.kind === "velocity"
      ? "ramps"
      : envelope === null
        ? "steps"
        : envelopeShape(envelope)

  // as long as the step lasts, which its own envelopes may modulate
  const stepBeats = paceBeats(stepPace(patch, step))
  // the setting the CC drives, if it drives one
  const modulation: ModulationJSON | undefined =
    lane.kind === "cc" ? modulationForCC(patch, lane.cc) : undefined
  const snapValue = (value: number) =>
    modulation === undefined ? value : snapToModulation(modulation, value)
  const stops = useMemo(
    () =>
      modulation === undefined
        ? []
        : modulationStops(modulation).map(({ value, cc }) => ({
            cc,
            label: modulationValueLabel(modulation.target, value, localized),
          })),
    [modulation, localized],
  )
  // the setting's own value, which a step without the envelope plays: where
  // the range reaches it
  const ownValue = (() => {
    if (modulation === undefined) {
      return null
    }
    const own = settingValue(patch, modulation.target)
    return inModulationRange(modulation, own)
      ? modulationCC(modulation, own)
      : null
  })()
  // Stored in beats, drawn and edited as fractions of the step as it is now:
  // an envelope keeps its timing when the pace changes, and whatever lies
  // past a shortened step's end is kept, off to the right, rather than lost.
  const envelopePoints =
    envelope === null ? [] : toStepTimes(envelope.points, stepBeats)
  const grid = useMemo(
    () => gridTimes(stepBeats, gridBeats),
    [stepBeats, gridBeats],
  )
  const { notes } = useStepPreview(step)
  const velocities =
    lane.kind === "velocity" ? velocityPoints(notes, lane.voice) : []
  // every other voice's notes, dimmed behind the voice on show
  const otherVelocities =
    lane.kind === "velocity"
      ? ([0, 1, 2, 3] as const)
          .filter((voice) => voice !== lane.voice)
          .flatMap((voice) => velocityPoints(notes, voice))
      : []
  // the roll's keys top to bottom: all of them in range, or only those played
  const [collapsed, setCollapsed] = useState(false)
  const rows = useMemo(() => pianoRows(patch, collapsed), [patch, collapsed])
  const rowOf = useMemo(
    () => new Map(rows.map((note, index) => [note, index])),
    [rows],
  )
  const keyHeight = (height - 2 * PAD) / rows.length
  const keyY = (note: number) => PAD + (rowOf.get(note) ?? 0) * keyHeight
  // the envelope's line; a velocity lane has lollipops instead
  const points: EnvelopePointJSON[] = envelopePoints
  const span = { x: width - 2 * PAD, y: height - 2 * PAD }

  // Lines as close as the grid allows; failing that beats, failing that bars.
  const lineGap = (beats: number) => (beats / stepBeats / viewLength) * span.x
  const lines =
    lineGap(gridBeats) >= MIN_LINE_GAP
      ? grid
      : gridTimes(stepBeats, lineGap(1) >= MIN_LINE_GAP ? 1 : 4)
  // columns shaded in turn, by the bar or the beat as the zoom allows
  const band = bandBeats(view, stepBeats, span.x)
  const bands = Array.from(
    { length: Math.ceil(stepBeats / band - 1e-9) },
    (_, index) => index,
  )
    .filter((index) => index % 2 === 1)
    .map((index) => ({
      from: (index * band) / stepBeats,
      to: Math.min(1, ((index + 1) * band) / stepBeats),
    }))
  const onBeat = (time: number) =>
    Math.abs(time * stepBeats - Math.round(time * stepBeats)) < 1e-6

  const local = (event: MouseEvent) => {
    const rect = svg.current?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  const snap = (time: number, free: boolean) =>
    free ? time : snapTime(time, stepBeats, gridBeats)

  const onMouseDown = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return
    }
    // keeps the page from selecting text under a drag
    event.preventDefault()
    frame.current?.focus()
    setDragging(true)
    document.addEventListener("mouseup", () => setDragging(false), {
      once: true,
    })

    const down = event.nativeEvent
    if (lane.kind === "velocity") {
      editVelocities(down)
      return
    }
    const start = local(down)
    const original = envelopePoints
    const commit = beginGesture()
    // A lane the step has no envelope for gets one at the first mark.
    const id = envelope?.id ?? nextEnvelopeId(sequencerStore.patch)
    const setPoints = (next: EnvelopePointJSON[]) => {
      const current = sequencerStore.patch
      const points = toBeatTimes(
        next.map((point) => ({ ...point, value: snapValue(point.value) })),
        stepBeats,
      )
      commit(
        current.steps[step].envelopes.some((each) => each.id === id)
          ? updateEnvelope(current, step, id, { points })
          : addEnvelope(current, step, {
              cc: lane.cc,
              channel: lane.channel,
              points,
            }),
      )
    }
    const valueDelta = (dy: number) => (-dy / span.y) * ENVELOPE_MAX_VALUE
    // the second press of a double-click: never a delete or a second point
    const second = down.detail >= 2

    if (tool === "draw") {
      paint(original, start, down.altKey, setPoints, down)
      return
    }

    const pointIndex = hitPoint(original, plot, start.x, start.y)
    if (pointIndex !== null) {
      const point = original[pointIndex]
      observeDrag(down, {
        onMove: (move, delta) => {
          const time =
            Math.abs(delta.x) < SIDEWAYS
              ? point.time
              : snap(point.time + (delta.x / span.x) * viewLength, move.altKey)
          setPoints(
            movePoint(
              original,
              pointIndex,
              time,
              point.value + valueDelta(delta.y),
            ),
          )
        },
        onClick: () => {
          if (!second) {
            setPoints(removePoint(original, pointIndex))
          }
        },
      })
      return
    }

    const segmentIndex = hitSegment(original, plot, start.x, start.y, shape)
    if (segmentIndex !== null) {
      observeDrag(down, {
        onMove: (_, delta) =>
          setPoints(
            moveSegment(original, segmentIndex, valueDelta(delta.y), shape),
          ),
        onClick: (up) => {
          if (!second) {
            setPoints(
              insertPointOnLine(
                original,
                snap(timeAtX(plot, start.x), up.altKey),
                shape,
              ),
            )
          }
        },
      })
      return
    }

    if (second) {
      setPoints(
        insertPoint(original, {
          time: snap(timeAtX(plot, start.x), down.altKey),
          value: valueAtY(plot, start.y),
        }),
      )
    }
  }

  /**
   * Paints values as the mouse passes, like Signal's pencil. On the grid,
   * each cell the mouse crosses holds one value — cells skipped by a quick
   * stroke are filled in along it — so the stroke comes out as flat steps.
   * With Alt, it follows the mouse freely; going back over a stretch paints
   * it again.
   */
  const paint = (
    original: EnvelopePointJSON[],
    start: { x: number; y: number },
    free: boolean,
    setPoints: (next: EnvelopePointJSON[]) => void,
    down: MouseEvent,
  ) => {
    const cells = new Map<number, number>()
    const samples = new Map<number, number>()
    let last: { time: number; value: number } | null = null

    const paintAt = (x: number, y: number) => {
      const time = timeAtX(plot, x)
      const value = snapValue(valueAtY(plot, y))
      if (free) {
        if (last !== null) {
          const low = Math.min(last.time, time)
          const high = Math.max(last.time, time)
          for (const painted of [...samples.keys()]) {
            if (painted > low && painted < high) {
              samples.delete(painted)
            }
          }
        }
        samples.set(time, value)
        const stroke = [...samples].map(([at, level]) => ({
          time: at,
          value: level,
        }))
        const times = stroke.map((point) => point.time)
        setPoints(
          paintPoints(
            original,
            Math.min(...times),
            Math.max(...times),
            stroke,
            shape,
          ),
        )
      } else {
        const cell = cellAt(grid, time)
        const from = last === null ? cell : cellAt(grid, last.time)
        const fromValue = last === null ? value : last.value
        const steps = Math.abs(cell - from)
        for (let along = 0; along <= steps; along++) {
          const index = from + Math.sign(cell - from) * along
          cells.set(
            index,
            snapValue(
              steps === 0
                ? value
                : fromValue + ((value - fromValue) * along) / steps,
            ),
          )
        }
        const stairs = stairsFor(grid, cells)
        if (stairs !== null) {
          setPoints(
            paintPoints(original, stairs.from, stairs.to, stairs.stroke, shape),
          )
        }
      }
      last = { time, value }
    }

    paintAt(start.x, start.y)
    observeDrag(down, {
      onMove: (_, delta) => paintAt(start.x + delta.x, start.y + delta.y),
    })
  }

  /**
   * The lollipops take an envelope's point gestures, up and down only, and
   * Draw: each edit sets the velocity of the dots behind the notes.
   */
  const editVelocities = (down: MouseEvent) => {
    const start = local(down)
    const commit = beginGesture()
    const second = down.detail >= 2
    const valueDelta = (dy: number) => (-dy / span.y) * ENVELOPE_MAX_VALUE
    const apply = (
      drawn: Map<string, { point: VelocityPoint; value: number }>,
    ) => {
      let next = sequencerStore.patch
      for (const { point, value } of drawn.values()) {
        next = setDotVelocity(next, point.voice, point.dot, value, accentAmount)
      }
      commit(next)
    }
    // the dots behind these points, each raised from where it started
    const raise = (moved: VelocityPoint[], by: number) =>
      apply(
        new Map(
          moved.map((point) => [
            dotKey(point),
            { point, value: point.value + by },
          ]),
        ),
      )

    if (tool === "draw") {
      // the stroke's value is shown, not the note it started over
      setHover({ point: null, segment: null })
      const painted = new Map<string, { point: VelocityPoint; value: number }>()
      let last = { x: start.x, value: valueAtY(plot, start.y) }
      const paintTo = (from: typeof last, to: typeof last) => {
        for (const { point, value } of pointsAlong(
          velocities,
          plot,
          from,
          to,
        )) {
          painted.set(dotKey(point), { point, value })
        }
        if (painted.size > 0) {
          apply(painted)
        }
      }
      // a press catches the notes just either side of it
      paintTo(
        { x: start.x - REACH, value: last.value },
        { x: start.x + REACH, value: last.value },
      )
      observeDrag(down, {
        onMove: (_, delta) => {
          const now = {
            x: start.x + delta.x,
            value: valueAtY(plot, start.y + delta.y),
          }
          paintTo(last, now)
          last = now
        },
      })
      return
    }

    const pointIndex = hitLollipop(velocities, plot, start.x, start.y)
    if (pointIndex === null) {
      return
    }
    const point = velocities[pointIndex]
    const onHead = hitPoint([point], plot, start.x, start.y) !== null
    // held for the readout while the drag has the mouse
    setHover({ point: pointIndex, segment: null })
    observeDrag(down, {
      onMove: (_, delta) => raise([point], valueDelta(delta.y)),
      onClick: () => {
        if (onHead && !second) {
          // back to the voice's own velocity
          raise([point], patch.voices[point.voice].velocity - point.value)
        }
      },
    })
  }

  const onMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const { x, y } = local(event.nativeEvent)
    setPointer({ x, y })
    // while a button is down, the drag has the mouse
    if (event.buttons !== 0) {
      return
    }
    if (lane.kind === "velocity") {
      setHover({ point: hitLollipop(velocities, plot, x, y), segment: null })
      return
    }
    const point = hitPoint(points, plot, x, y)
    setHover({
      point,
      segment: point === null ? hitSegment(points, plot, x, y, shape) : null,
    })
  }

  // On the graph B is Live's Draw key, and goes no further.
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.code !== "KeyB" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) {
      setTool(tool === "draw" ? "edit" : "draw")
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "KeyB") {
      event.stopPropagation()
    }
  }

  const cursor =
    tool === "draw"
      ? "crosshair"
      : hover.point !== null
        ? lane.kind === "velocity"
          ? "ns-resize"
          : "pointer"
        : hover.segment !== null
          ? "ns-resize"
          : "default"

  // The envelope's value where the mouse is, shown beside it while it is over
  // the line or a point, or dragging; on a velocity lane, the note's under it
  // or being dragged, or where a Draw stroke is.
  const readoutValue = (() => {
    if (pointer === null) {
      return null
    }
    if (lane.kind === "velocity") {
      const held = hover.point === null ? undefined : velocities[hover.point]
      return held !== undefined
        ? held.value
        : dragging && tool === "draw"
          ? valueAtY(plot, pointer.y)
          : null
    }
    if (
      points.length === 0 ||
      !(dragging || hover.point !== null || hover.segment !== null)
    ) {
      return null
    }
    return hover.point !== null && !dragging
      ? points[hover.point].value
      : valueAt(points, timeAtX(plot, pointer.x), shape)
  })()
  const readout = (() => {
    if (readoutValue === null || pointer === null) {
      return null
    }
    const value = Math.round(readoutValue ?? 0)
    // a modulated setting's value by name
    const text =
      modulation === undefined
        ? String(value)
        : modulationValueLabel(
            modulation.target,
            modulationValueAt(modulation, value),
            localized,
          )
    const labelWidth = 8 + 7 * text.length
    return {
      value,
      text,
      width: labelWidth,
      x: Math.min(Math.max(0, pointer.x + 10), width - labelWidth - 2),
      y: Math.max(2, pointer.y - 24),
    }
  })()

  // the modulated setting's values, where they are ruled and named
  const stopSpacing =
    stops.length > 1 ? span.y / (stops.length - 1) : Number.POSITIVE_INFINITY
  const guides = stopSpacing >= MIN_GUIDE_GAP ? stops : []
  const named = axisStops(stops, stopSpacing, MIN_LABEL_GAP)
  const axisWidth =
    modulation === undefined
      ? AXIS_WIDTH
      : Math.min(
          MAX_AXIS_WIDTH,
          Math.max(
            AXIS_WIDTH,
            8 +
              AXIS_CHARACTER *
                Math.max(...named.map(({ label }) => label.length)),
          ),
        )

  return (
    <div className="flex gap-1">
      <div className="flex flex-none flex-col">
        <div
          className="flex items-center justify-center"
          style={{ height: RULER_HEIGHT, width: PIANO_WIDTH }}
        >
          <IconButton
            className="h-[18px] w-[18px]"
            title={localized["sequencer-collapse-scale"]}
            aria-label={localized["sequencer-collapse-scale"]}
            aria-pressed={collapsed}
            active={collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <UnfoldMoreHorizontalIcon size={14} />
            ) : (
              <UnfoldLessHorizontalIcon size={14} />
            )}
          </IconButton>
        </div>
        <PianoKeys
          rows={rows}
          collapsed={collapsed}
          scale={patch.scale}
          height={height}
          pad={PAD}
        />
      </div>
      <div className="min-w-0 flex-1">
        <EnvelopeRuler
          plot={plot}
          stepBeats={stepBeats}
          mark={mark}
          onView={setView}
          onMark={setMark}
        />
        <div
          ref={frame}
          role="application"
          aria-label={localized["sequencer-envelope"]}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: B switches tools while the graph has focus
          tabIndex={0}
          data-tool={tool}
          className="rounded-sm outline-none focus-visible:outline-1 focus-visible:outline-theme"
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        >
          <svg
            ref={svg}
            data-keys={`${rows[rows.length - 1]}-${rows[0]}`}
            width={width}
            height={height}
            className="block select-none"
            style={{ cursor }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseLeave={() => {
              setHover({ point: null, segment: null })
              setPointer(null)
            }}
          >
            <title>{localized["sequencer-envelope"]}</title>
            <rect
              width={width}
              height={height}
              fill="var(--midiseq-editor-background)"
            />

            {/* a row to each key, the black keys' darker, as the keyboard has */}
            {rows.map((note) => (
              <rect
                key={note}
                data-row={note}
                x={0}
                y={keyY(note)}
                width={width}
                height={keyHeight}
                fill={
                  isBlackKey(note)
                    ? "var(--midiseq-roll-black)"
                    : "var(--midiseq-roll-white)"
                }
              />
            ))}

            {bands.map(({ from, to }) => (
              <rect
                key={from}
                data-band={from}
                x={toX(plot, from)}
                y={0}
                width={Math.max(0, toX(plot, to) - toX(plot, from))}
                height={height}
                fill="var(--midiseq-roll-band)"
              />
            ))}

            {lines.map((time) => (
              <line
                key={time}
                x1={toX(plot, time)}
                x2={toX(plot, time)}
                y1={0}
                y2={height}
                stroke={
                  onBeat(time)
                    ? "var(--midiseq-editor-grid)"
                    : "var(--midiseq-editor-grid-secondary)"
                }
                strokeWidth={1}
              />
            ))}

            {notes
              .filter((note) => rowOf.has(note.note))
              .map((note) => (
                <rect
                  key={`${note.voice}-${note.note}-${note.start}`}
                  data-note={note.note}
                  data-voice={note.voice}
                  x={toX(plot, note.start)}
                  y={keyY(note.note) + 0.5}
                  width={Math.max(
                    1,
                    toX(plot, note.end) - toX(plot, note.start),
                  )}
                  height={Math.max(1, keyHeight - 1)}
                  rx={2}
                  fill={`var(--midiseq-voice-${note.voice})`}
                  // faded under lollipops, whose stems they would pass for
                  fillOpacity={lane.kind === "velocity" ? 0.25 : undefined}
                />
              ))}

            {lane.kind === "velocity" &&
              [lane.voice].map((voice) => {
                // where a note counts as plain, or as either accent
                const base = patch.voices[voice].velocity
                return [base - accentAmount, base, base + accentAmount]
                  .filter((level) => level >= 1 && level <= 127)
                  .map((level) => (
                    <line
                      key={`${voice}-${level}`}
                      data-level={level}
                      x1={0}
                      x2={width}
                      y1={toY(plot, level)}
                      y2={toY(plot, level)}
                      stroke={`var(--midiseq-voice-${voice})`}
                      strokeOpacity={level === base ? 0.45 : 0.3}
                      strokeDasharray={level === base ? undefined : "3 3"}
                    />
                  ))
              })}

            {lane.kind === "velocity" && (
              <>
                {/* the other voices', dimmed and out of reach */}
                <g data-other-velocities opacity={0.35} pointerEvents="none">
                  {otherVelocities.map((point) => (
                    <Lollipop
                      key={`${point.voice}-${point.dot}-${point.time}`}
                      plot={plot}
                      point={point}
                    />
                  ))}
                </g>
                {velocities.map((point, index) => (
                  <Lollipop
                    // biome-ignore lint/suspicious/noArrayIndexKey: a note is its place in time order
                    key={index}
                    plot={plot}
                    point={point}
                    index={index}
                    hovered={hover.point === index}
                  />
                ))}
              </>
            )}

            {/* where a modulated setting's values lie, which points snap
                to, and the one the setting has of its own */}
            {guides.map(({ cc }) => (
              <line
                key={cc}
                data-guide={cc}
                x1={0}
                x2={width}
                y1={toY(plot, cc)}
                y2={toY(plot, cc)}
                stroke="var(--midiseq-envelope)"
                strokeOpacity={0.14}
                pointerEvents="none"
              />
            ))}
            {ownValue !== null && (
              <line
                data-own-value={ownValue}
                x1={0}
                x2={width}
                y1={toY(plot, ownValue)}
                y2={toY(plot, ownValue)}
                stroke="var(--midiseq-envelope)"
                strokeOpacity={0.6}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}

            {points.length > 0 && (
              <>
                <path
                  d={areaPath(points, plot, shape)}
                  fill="var(--midiseq-envelope)"
                  fillOpacity={0.08}
                />
                <path
                  data-envelope-line
                  d={linePath(points, plot, shape)}
                  fill="none"
                  stroke="var(--midiseq-envelope)"
                  strokeWidth={hover.segment !== null ? 2 : 1.25}
                />
                {shape === "steps" &&
                  stepCorners(points).map((corner) => (
                    <rect
                      key={`corner-${corner.time}-${corner.value}`}
                      data-corner
                      {...square(
                        toX(plot, corner.time),
                        toY(plot, corner.value),
                        HANDLE,
                      )}
                      fill="var(--midiseq-editor-background)"
                      stroke="var(--midiseq-envelope)"
                      strokeWidth={1.25}
                      pointerEvents="none"
                    />
                  ))}
                {points.map((point, index) => (
                  <rect
                    // biome-ignore lint/suspicious/noArrayIndexKey: a point is its place in time order
                    key={index}
                    data-point={index}
                    data-velocity={
                      lane.kind === "velocity"
                        ? Math.round(point.value)
                        : undefined
                    }
                    {...square(
                      toX(plot, point.time),
                      toY(plot, point.value),
                      hover.point === index ? HANDLE + 2 : HANDLE,
                    )}
                    fill={
                      hover.point === index
                        ? "var(--midiseq-envelope)"
                        : "var(--midiseq-editor-background)"
                    }
                    stroke="var(--midiseq-envelope)"
                    strokeWidth={1.25}
                  />
                ))}
              </>
            )}

            <Playhead step={step} plot={plot} />

            {mark !== null && (
              <line
                data-zoom-mark
                x1={toX(plot, mark)}
                x2={toX(plot, mark)}
                y1={0}
                y2={height}
                stroke="var(--midiseq-fg)"
                strokeOpacity={0.7}
                pointerEvents="none"
              />
            )}

            {readout !== null && (
              <g
                data-envelope-value={readout.value}
                data-envelope-label={readout.text}
                pointerEvents="none"
              >
                <rect
                  x={readout.x}
                  y={readout.y}
                  width={readout.width}
                  height={16}
                  rx={3}
                  fill="var(--midiseq-background-dark)"
                  stroke="var(--midiseq-envelope)"
                  strokeOpacity={0.7}
                />
                <text
                  x={readout.x + readout.width / 2}
                  y={readout.y + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--midiseq-fg)"
                  fontFamily="var(--midiseq-mono-font)"
                >
                  {readout.text}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>
      <div
        aria-hidden
        data-axis
        // the colour of whatever it reads off: the envelope's own blue, or
        // the voice's
        className="relative flex-none font-mono text-micro"
        style={{
          width: axisWidth,
          height,
          marginTop: RULER_HEIGHT,
          color:
            lane.kind === "velocity"
              ? `var(--midiseq-voice-${lane.voice})`
              : "var(--midiseq-envelope)",
        }}
      >
        {modulation === undefined
          ? AXIS.map((value) => (
              <span
                key={value}
                className="absolute left-1 -translate-y-1/2"
                style={{ top: toY(plot, value) }}
              >
                {value}
              </span>
            ))
          : named.map(({ cc, label }) => (
              <span
                key={cc}
                data-axis-value={cc}
                className="absolute right-0 left-1 -translate-y-1/2 truncate whitespace-nowrap"
                style={{ top: toY(plot, cc) }}
                title={label}
              >
                {label}
              </span>
            ))}
      </div>
    </div>
  )
}
