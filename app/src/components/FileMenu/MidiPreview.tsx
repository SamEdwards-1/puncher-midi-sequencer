import {
  firstAtOrAfter,
  ImportPlan,
  NOTE_FILTERED,
  NOTE_UNCHOSEN,
  PreparedMidi,
  sourceKey,
} from "@midiseq/core"
import {
  FC,
  KeyboardEvent,
  memo,
  MouseEvent as ReactMouseEvent,
  RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { EnvelopeRuler } from "../StepEditor/EnvelopeRuler"
import { Plot, toX, View, WHOLE_STEP } from "../StepEditor/envelopeGeometry"
import { observeDrag } from "../StepEditor/observeDrag"
import { PianoKeys } from "../StepEditor/PianoKeys"

export const PREVIEW_HEIGHT = 200
const RULER_HEIGHT = 26
// the handles sit below the bar numbers, on the stretch's bar
const HANDLE_TOP = 11
const PAD = 6
// before the preview has been measured, and in tests
const FALLBACK_WIDTH = 600
// a step's number shows only where its band has room
const MIN_STEP_LABEL = 18
const SOURCE_COLOURS = 8
const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

export interface ImportRange {
  start: number
  end: number
}

export const sourceColour = (index: number) =>
  `var(--midiseq-jump-${index % SOURCE_COLOURS})`

const useWidth = (ref: RefObject<HTMLElement | null>) => {
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
  return width > 0 ? width : FALLBACK_WIDTH
}

// The theme's colours, as a canvas needs them: its custom properties read
// off the page, since a canvas can't be given var(…).
const readColours = (element: Element) => {
  const style = getComputedStyle(element)
  const read = (name: string) => style.getPropertyValue(name).trim() || "#888"
  return {
    white: read("--midiseq-roll-white"),
    black: read("--midiseq-roll-black"),
    band: read("--midiseq-roll-band"),
    grid: read("--midiseq-editor-grid"),
    background: read("--midiseq-background"),
    label: read("--midiseq-fg-tertiary"),
    muted: read("--midiseq-fg-tertiary"),
    cut: read("--midiseq-record"),
    sources: Array.from({ length: SOURCE_COLOURS }, (_, index) =>
      read(`--midiseq-jump-${index}`),
    ),
  }
}

/**
 * The file as a piano roll, as the envelope editor draws a step, its keys
 * down the left. A note is drawn in its part's colour; gray if the filter
 * keeps it out; red if it would be dealt into a step past the grid's end;
 * and faint if its part isn't chosen. What lies outside the stretch is
 * dimmed, and a band for each step's worth of notes — from its first note
 * to the next step's — is numbered with the step it fills.
 *
 * The ruler across the top zooms and scrolls it as the envelope editor's
 * does: drag it up to zoom in, down to zoom out, sideways to scroll. On it
 * sits the stretch to import, with a handle at each end to drag — snapping
 * to `snap` beats — or the stretch itself to slide it along; arrow keys move
 * a handle a snap at a time.
 *
 * The roll is drawn on a canvas, and only the notes in view: a file can
 * hold tens of thousands, and every drag of the range redraws it.
 */
export const MidiPreview: FC<{
  prepared: PreparedMidi
  plan: ImportPlan
  chosen: Set<string>
  range: ImportRange
  onRange: (range: ImportRange) => void
  totalBeats: number
  beatsPerBar: number
  snap: number
  labels: { start: string; end: string; bar: string; preview: string }
  // the roll's height, without the ruler
  height?: number
}> = memo(
  ({
    prepared,
    plan,
    chosen,
    range,
    onRange,
    totalBeats,
    beatsPerBar,
    snap,
    labels,
    height = PREVIEW_HEIGHT,
  }) => {
    const frame = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    // Read off the page once: reading them makes the browser work out the
    // whole page's styles, which on every draw would cost more than the
    // drawing does.
    const colours = useRef<ReturnType<typeof readColours> | null>(null)
    const width = useWidth(frame)
    const [view, setView] = useState<View>(WHOLE_STEP)
    // the time pressed on the ruler, as a fraction of the file, while a
    // zoom or scroll lasts
    const [mark, setMark] = useState<number | null>(null)
    const plot: Plot = { width, height: height, pad: PAD, view }
    const span = width - 2 * PAD
    const perBeat = span / ((view.end - view.start) * totalBeats)
    const x = (beat: number) => toX(plot, beat / totalBeats)

    // the keys the roll shows: those of the parts chosen, or of every part
    const rows = useMemo(() => {
      const shown = prepared.sources.filter((source) =>
        chosen.has(sourceKey(source)),
      )
      const spanned = shown.length > 0 ? shown : prepared.sources
      let low = 60
      let high = 71
      if (spanned.length > 0) {
        low = Math.min(...spanned.map((source) => source.low))
        high = Math.max(...spanned.map((source) => source.high), low + 11)
      }
      return Array.from({ length: high - low + 1 }, (_, index) => high - index)
    }, [prepared, chosen])

    // how many notes came to each end, for the page to say
    const counts = useMemo(() => {
      let filtered = 0
      let dealt = 0
      let cut = 0
      for (const fate of plan.fates) {
        if (fate === NOTE_FILTERED) {
          filtered++
        } else if (fate >= 0) {
          dealt++
          if (fate >= plan.placed) {
            cut++
          }
        }
      }
      return { filtered, dealt, cut }
    }, [plan])

    useLayoutEffect(() => {
      const element = canvas.current
      const context = element?.getContext("2d")
      if (element === null || element === undefined || !context) {
        return
      }
      const ratio = window.devicePixelRatio || 1
      const pixelWidth = Math.round(width * ratio)
      const pixelHeight = Math.round(height * ratio)
      // resizing clears the canvas and makes it anew, so only when it must
      if (element.width !== pixelWidth || element.height !== pixelHeight) {
        element.width = pixelWidth
        element.height = pixelHeight
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      colours.current ??= readColours(element)
      const theme = colours.current

      const keyHeight = (height - 2 * PAD) / rows.length
      const rowOf = new Int16Array(128).fill(-1)
      rows.forEach((key, index) => {
        rowOf[key] = index
        context.fillStyle = BLACK_KEYS.has(key % 12) ? theme.black : theme.white
        context.fillRect(0, PAD + index * keyHeight, width, keyHeight)
      })

      const from = view.start * totalBeats
      const to = view.end * totalBeats

      // a band for each step's notes in view, numbered while it finds a step
      const bandsFrom = Math.max(
        0,
        firstAtOrAfter(plan.chunks, from, (chunk) => chunk.start) - 1,
      )
      context.font = "9px monospace"
      context.textBaseline = "top"
      for (let index = bandsFrom; index < plan.chunks.length; index++) {
        const chunk = plan.chunks[index]
        if (chunk.start > to) {
          break
        }
        const left = x(chunk.start)
        const right = x(chunk.end)
        if (index % 2 === 1) {
          context.fillStyle = theme.band
          context.fillRect(left, 0, right - left, height)
        }
        context.fillStyle = theme.grid
        context.fillRect(Math.round(left), 0, 1, height)
        if (index < plan.placed && right - left >= MIN_STEP_LABEL) {
          context.fillStyle = theme.label
          context.fillText(String(plan.firstStep + index + 1), left + 3, 2)
        }
      }

      // The notes in view, gathered a colour at a time and filled at once.
      // A colour's notes on a key are drawn as runs: one that starts where
      // the last left off, or within a pixel of it, carries the run on, so
      // zoomed out, where hundreds of notes share a few pixels, a few
      // shapes are filled rather than every note.
      const { starts, ends, keys, sourceOf } = prepared
      const first = firstAtOrAfter(starts, from - prepared.longest, (t) => t)
      const last = firstAtOrAfter(starts, to, (t) => t)
      const rowTop = (row: number) => PAD + row * keyHeight + 0.5
      const rowHeight = Math.max(1, keyHeight - 1)
      const buckets = new Map<
        string,
        { alpha: number; colour: string; runs: Float64Array; rects: number[] }
      >()
      for (let index = first; index < last; index++) {
        if (ends[index] < from) {
          continue
        }
        const row = rowOf[keys[index]]
        if (row < 0) {
          continue
        }
        const fate = plan.fates[index]
        const colour =
          fate === NOTE_UNCHOSEN || fate === NOTE_FILTERED
            ? theme.muted
            : fate >= plan.placed
              ? theme.cut
              : theme.sources[sourceOf[index] % SOURCE_COLOURS]
        const alpha =
          fate === NOTE_UNCHOSEN ? 0.25 : fate === NOTE_FILTERED ? 0.85 : 1
        const bucketKey = `${alpha}|${colour}`
        let bucket = buckets.get(bucketKey)
        if (bucket === undefined) {
          // a run's left and right for each row, NaN where none is open
          bucket = {
            alpha,
            colour,
            runs: new Float64Array(rows.length * 2).fill(Number.NaN),
            rects: [],
          }
          buckets.set(bucketKey, bucket)
        }
        const left = x(starts[index])
        const right = Math.max(left + 1, x(ends[index]))
        const { runs, rects } = bucket
        const open = runs[row * 2 + 1]
        if (!Number.isNaN(open) && left <= open + 1) {
          runs[row * 2 + 1] = Math.max(open, right)
        } else {
          if (!Number.isNaN(open)) {
            rects.push(runs[row * 2], row, open)
          }
          runs[row * 2] = left
          runs[row * 2 + 1] = right
        }
      }
      for (const { alpha, colour, runs, rects } of buckets.values()) {
        context.globalAlpha = alpha
        context.fillStyle = colour
        context.beginPath()
        for (let at = 0; at < rects.length; at += 3) {
          const row = rects[at + 1]
          context.rect(
            rects[at],
            rowTop(row),
            rects[at + 2] - rects[at],
            rowHeight,
          )
        }
        for (let row = 0; row < rows.length; row++) {
          if (!Number.isNaN(runs[row * 2 + 1])) {
            context.rect(
              runs[row * 2],
              rowTop(row),
              runs[row * 2 + 1] - runs[row * 2],
              rowHeight,
            )
          }
        }
        context.fill()
      }
      context.globalAlpha = 1

      // what lies outside the stretch is left behind
      context.globalAlpha = 0.6
      context.fillStyle = theme.background
      context.fillRect(0, 0, Math.max(0, x(range.start)), height)
      const end = x(range.end)
      context.fillRect(end, 0, Math.max(0, width - end), height)
      context.globalAlpha = 1
    })

    const snapTo = (beat: number) =>
      snap > 0 ? Math.round(beat / snap) * snap : beat
    const clampRange = (next: ImportRange): ImportRange => {
      const least = snap > 0 ? snap : 1 / 48
      const start = Math.max(0, Math.min(next.start, totalBeats - least))
      const end = Math.min(totalBeats, Math.max(next.end, start + least))
      return { start, end }
    }

    // Dragging a handle moves that end; the stretch between moves both.
    const drag =
      (part: "start" | "end" | "both") =>
      (event: ReactMouseEvent<SVGElement>) => {
        if (event.button !== 0) {
          return
        }
        event.preventDefault()
        // the ruler under it zooms; the range is its own
        event.stopPropagation()
        const from = range
        observeDrag(event.nativeEvent, {
          onMove: (_, delta) => {
            const by = delta.x / perBeat
            if (part === "both") {
              const length = from.end - from.start
              const start = Math.min(
                Math.max(0, snapTo(from.start + by)),
                totalBeats - length,
              )
              onRange({ start, end: start + length })
            } else {
              onRange(clampRange({ ...from, [part]: snapTo(from[part] + by) }))
            }
          },
        })
      }

    const nudge = (part: "start" | "end") => (event: KeyboardEvent) => {
      const step = snap > 0 ? snap : 1
      const by =
        event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -step
          : event.key === "ArrowRight" || event.key === "ArrowUp"
            ? step
            : event.key === "PageDown"
              ? -beatsPerBar * 4
              : event.key === "PageUp"
                ? beatsPerBar * 4
                : null
      if (by === null) {
        return
      }
      event.preventDefault()
      onRange(clampRange({ ...range, [part]: snapTo(range[part] + by) }))
    }

    const barLabel = (beat: number) =>
      String(Math.round((beat / beatsPerBar + 1) * 100) / 100)

    const handle = (part: "start" | "end") => {
      const beat = range[part]
      return (
        <g
          role="slider"
          tabIndex={0}
          aria-label={labels[part]}
          aria-valuemin={0}
          aria-valuemax={totalBeats}
          aria-valuenow={beat}
          aria-valuetext={`${labels.bar} ${barLabel(beat)}`}
          data-handle={part}
          className="cursor-ew-resize outline-none focus-visible:[&>rect]:stroke-fg"
          onMouseDown={drag(part)}
          onKeyDown={nudge(part)}
        >
          <rect
            x={x(beat) - 4}
            y={HANDLE_TOP}
            width={8}
            height={RULER_HEIGHT - HANDLE_TOP - 1}
            rx={2}
            fill="var(--midiseq-theme)"
            stroke="transparent"
            strokeWidth={1.5}
          />
        </g>
      )
    }

    return (
      <div className="flex gap-1">
        <div style={{ marginTop: RULER_HEIGHT }}>
          <PianoKeys rows={rows} collapsed={false} height={height} pad={PAD} />
        </div>
        <div ref={frame} className="min-w-0 flex-1">
          <EnvelopeRuler
            plot={plot}
            stepBeats={totalBeats}
            beatsPerBar={beatsPerBar}
            height={RULER_HEIGHT}
            mark={mark}
            onView={setView}
            onMark={setMark}
          >
            {/* the stretch to import, which slides as a whole */}
            <rect
              data-range
              x={x(range.start)}
              y={RULER_HEIGHT - 8}
              width={Math.max(0, x(range.end) - x(range.start))}
              height={8}
              fill="var(--midiseq-theme)"
              fillOpacity={0.45}
              className="cursor-grab"
              onMouseDown={drag("both")}
            />
            {handle("start")}
            {handle("end")}
          </EnvelopeRuler>
          <div className="relative" style={{ height: height }}>
            <canvas
              ref={canvas}
              role="img"
              aria-label={labels.preview}
              data-preview
              data-steps={plan.chunks.length}
              data-placed={plan.placed}
              data-dealt={counts.dealt}
              data-cut={counts.cut}
              data-filtered={counts.filtered}
              className="block"
              style={{ width, height: height }}
            />
            {mark !== null && (
              <div
                data-zoom-mark
                className="pointer-events-none absolute top-0 h-full w-px bg-fg opacity-70"
                style={{ left: toX(plot, mark) }}
              />
            )}
          </div>
        </div>
      </div>
    )
  },
)
