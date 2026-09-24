import {
  ENVELOPE_MAX_VALUE,
  EnvelopeJSON,
  EnvelopePointJSON,
  gridTimes,
  insertPoint,
  insertPointOnLine,
  movePoint,
  moveSegment,
  paceBeats,
  paintPoints,
  removePoint,
  snapTime,
  stairsFor,
  stepNotes,
  updateEnvelope,
} from "@midiseq/core"
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
import { usePatch } from "../../hooks/usePatch"
import { useEnvelopeGrid, useEnvelopeTool } from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import { useLocalization } from "../../localize/useLocalization"
import {
  areaPath,
  cellAt,
  hitPoint,
  hitSegment,
  isBlackKey,
  keyRange,
  linePath,
  Plot,
  timeAtX,
  toX,
  toY,
  valueAtY,
} from "./envelopeGeometry"
import { observeDrag } from "./observeDrag"

export const GRIDS = [
  { beats: 1, label: "1/4" },
  { beats: 0.5, label: "1/8" },
  { beats: 0.25, label: "1/16" },
  { beats: 0.125, label: "1/32" },
  { beats: 1 / 3, label: "1/8T" },
  { beats: 1 / 6, label: "1/16T" },
]

export const GRAPH_HEIGHT = 160
const PAD = 6
// before the graph has been measured, and in tests
const FALLBACK_WIDTH = 480
// a drag has to go this far sideways before a point leaves its time, so a
// straight drag up or down never nudges a point off the grid
const SIDEWAYS = 4
// grid lines closer than this are left out, though points still snap to them
const MIN_LINE_GAP = 4
const AXIS = [127, 96, 64, 32, 0]

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

/**
 * One step's CC envelope over a piano roll of the notes the step plays.
 * The notes follow the voices — pace, pattern, ratchets, length, rule — and
 * can't be touched here; the envelope is edited as in Live, drawn as in
 * Signal's control pane.
 *
 * Edit: click the line to add a point on it, double-click anywhere to place
 * one, drag a point to move it, drag the line to raise or lower it, click a
 * point to delete it. Draw: drag to paint values across the grid. Points
 * snap to the grid unless Alt is held, and B switches between the two.
 */
export const EnvelopeGraph: FC<{
  step: number
  envelope: EnvelopeJSON | null
}> = ({ step, envelope }) => {
  const patch = usePatch()
  const { sequencerStore } = useStores()
  const beginGesture = usePatchGesture()
  const [tool, setTool] = useEnvelopeTool()
  const [gridBeats] = useEnvelopeGrid()
  const localized = useLocalization()
  const frame = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const width = useWidth(frame, FALLBACK_WIDTH)
  const plot: Plot = { width, height: GRAPH_HEIGHT, pad: PAD }
  const [hover, setHover] = useState<{
    point: number | null
    segment: number | null
  }>({ point: null, segment: null })

  const stepBeats = paceBeats(patch.pace)
  const grid = useMemo(
    () => gridTimes(stepBeats, gridBeats),
    [stepBeats, gridBeats],
  )
  const notes = useMemo(() => stepNotes(patch, step), [patch, step])
  const keys = keyRange(notes.map((note) => note.note))
  const keyCount = keys.high - keys.low + 1
  const keyHeight = (GRAPH_HEIGHT - 2 * PAD) / keyCount
  const keyY = (note: number) => PAD + (keys.high - note) * keyHeight
  const points = envelope?.points ?? []
  const span = { x: width - 2 * PAD, y: GRAPH_HEIGHT - 2 * PAD }

  // Lines as close as the grid allows; failing that beats, failing that bars.
  const lineGap = (beats: number) => (beats / stepBeats) * span.x
  const lines =
    lineGap(gridBeats) >= MIN_LINE_GAP
      ? grid
      : gridTimes(stepBeats, lineGap(1) >= MIN_LINE_GAP ? 1 : 4)
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
    if (envelope === null || event.button !== 0) {
      return
    }
    // keeps the page from selecting text under a drag
    event.preventDefault()
    frame.current?.focus()

    const down = event.nativeEvent
    const start = local(down)
    const original = envelope.points
    const commit = beginGesture()
    const setPoints = (next: EnvelopePointJSON[]) =>
      commit(
        updateEnvelope(sequencerStore.patch, step, envelope.id, {
          points: next,
        }),
      )
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
              : snap(point.time + delta.x / span.x, move.altKey)
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

    const segmentIndex = hitSegment(original, plot, start.x, start.y)
    if (segmentIndex !== null) {
      observeDrag(down, {
        onMove: (_, delta) =>
          setPoints(moveSegment(original, segmentIndex, valueDelta(delta.y))),
        onClick: (up) => {
          if (!second) {
            setPoints(
              insertPointOnLine(
                original,
                snap(timeAtX(plot, start.x), up.altKey),
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
      const value = valueAtY(plot, y)
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
          paintPoints(original, Math.min(...times), Math.max(...times), stroke),
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
            steps === 0
              ? value
              : fromValue + ((value - fromValue) * along) / steps,
          )
        }
        const stairs = stairsFor(grid, cells)
        if (stairs !== null) {
          setPoints(
            paintPoints(original, stairs.from, stairs.to, stairs.stroke),
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

  const onMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    // while a button is down, the drag has the mouse
    if (event.buttons !== 0) {
      return
    }
    const { x, y } = local(event.nativeEvent)
    const point = hitPoint(points, plot, x, y)
    setHover({
      point,
      segment: point === null ? hitSegment(points, plot, x, y) : null,
    })
  }

  // In here B is Live's Draw key; elsewhere it stays Bump.
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
    envelope === null
      ? "default"
      : tool === "draw"
        ? "crosshair"
        : hover.point !== null
          ? "pointer"
          : hover.segment !== null
            ? "ns-resize"
            : "default"

  const gridLabel = GRIDS.find(({ beats }) => beats === gridBeats)?.label

  return (
    <div className="flex gap-1">
      <div
        aria-hidden
        className="relative w-7 flex-none font-mono text-micro text-fg-tertiary"
        style={{ height: GRAPH_HEIGHT }}
      >
        {AXIS.map((value) => (
          <span
            key={value}
            className="absolute right-1 -translate-y-1/2"
            style={{ top: toY(plot, value) }}
          >
            {value}
          </span>
        ))}
      </div>
      <div
        ref={frame}
        role="application"
        aria-label={localized["sequencer-envelope"]}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: B switches tools while the graph has focus
        tabIndex={0}
        data-tool={tool}
        className="min-w-0 flex-1 rounded-sm outline-none focus-visible:outline-1 focus-visible:outline-theme"
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <svg
          ref={svg}
          width={width}
          height={GRAPH_HEIGHT}
          className="block select-none"
          style={{ cursor }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover({ point: null, segment: null })}
        >
          <title>{localized["sequencer-envelope"]}</title>
          <rect
            width={width}
            height={GRAPH_HEIGHT}
            fill="var(--midiseq-editor-background)"
          />

          {Array.from({ length: keyCount }, (_, offset) => keys.low + offset)
            .filter(isBlackKey)
            .map((note) => (
              <rect
                key={note}
                x={0}
                y={keyY(note)}
                width={width}
                height={keyHeight}
                fill="var(--midiseq-editor-grid-secondary)"
                opacity={0.6}
              />
            ))}

          {lines.map((time) => (
            <line
              key={time}
              x1={toX(plot, time)}
              x2={toX(plot, time)}
              y1={0}
              y2={GRAPH_HEIGHT}
              stroke={
                onBeat(time)
                  ? "var(--midiseq-editor-grid)"
                  : "var(--midiseq-editor-grid-secondary)"
              }
              strokeWidth={1}
            />
          ))}

          {notes.map((note) => (
            <rect
              key={`${note.voice}-${note.note}-${note.start}`}
              data-note={note.note}
              data-voice={note.voice}
              x={toX(plot, note.start)}
              y={keyY(note.note) + 0.5}
              width={Math.max(1, toX(plot, note.end) - toX(plot, note.start))}
              height={Math.max(1, keyHeight - 1)}
              rx={2}
              fill={`var(--midiseq-voice-${note.voice})`}
              fillOpacity={0.4}
            />
          ))}

          {envelope !== null && points.length > 0 && (
            <>
              <path
                d={areaPath(points, plot)}
                fill="var(--midiseq-envelope)"
                fillOpacity={0.16}
              />
              <path
                data-envelope-line
                d={linePath(points, plot)}
                fill="none"
                stroke="var(--midiseq-envelope)"
                strokeWidth={hover.segment !== null ? 2.5 : 2}
              />
              {points.map((point, index) => (
                <circle
                  // biome-ignore lint/suspicious/noArrayIndexKey: a point is its place in time order
                  key={index}
                  data-point={index}
                  cx={toX(plot, point.time)}
                  cy={toY(plot, point.value)}
                  r={hover.point === index ? 5 : 4}
                  fill={
                    hover.point === index
                      ? "var(--midiseq-envelope)"
                      : "var(--midiseq-editor-background)"
                  }
                  stroke="var(--midiseq-envelope)"
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          <text
            x={width - PAD - 2}
            y={GRAPH_HEIGHT - PAD - 2}
            textAnchor="end"
            fontSize={11}
            fill="var(--midiseq-fg-secondary)"
            fontFamily="var(--midiseq-mono-font)"
          >
            {gridLabel}
          </text>
        </svg>
      </div>
    </div>
  )
}
