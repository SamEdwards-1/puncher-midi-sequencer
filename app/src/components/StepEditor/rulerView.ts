import { View } from "./envelopeGeometry"

// The closest a view comes in: an eighth of a beat across the graph, six of
// the slots the engine reads an envelope on.
const MIN_VIEW_BEATS = 1 / 8
// dragging this far up doubles the zoom, and this far down halves it
const PIXELS_PER_DOUBLING = 60

export interface ZoomDrag {
  // where the ruler was pressed, and where the mouse is now, as fractions
  // of the graph's width
  anchor: number
  at: number
  // how far the mouse has gone up (negative) or down since
  dy: number
  stepBeats: number
}

/**
 * The view a drag on the ruler leaves, as in Live: up zooms in and down
 * out, around the time that was under the mouse when it went down, and that
 * time follows the mouse left and right, so the roll pans with it. Never
 * further out than the whole step.
 */
export const zoomView = (
  from: View,
  { anchor, at, dy, stepBeats }: ZoomDrag,
): View => {
  const length = from.end - from.start
  const anchorTime = from.start + anchor * length
  const shortest = Math.min(1, MIN_VIEW_BEATS / stepBeats)
  const next = Math.min(
    1,
    Math.max(shortest, length * 2 ** (dy / PIXELS_PER_DOUBLING)),
  )
  const start = Math.min(1 - next, Math.max(0, anchorTime - at * next))
  return { start, end: start + next }
}

// a drag heading the other way has to go this far before it changes over
const SWITCH_PIXELS = 8

/**
 * A drag on the ruler under way. It moves on one axis at a time — up and
 * down zoom, sideways scrolls — and changes over when the mouse clearly
 * heads the other way, so a hand that wanders a little never zooms while it
 * scrolls, but can turn from one to the other without letting go.
 */
export interface RulerDrag {
  view: View
  // the time pressed on, and where across the graph it sits now
  time: number
  at: number
  axis: "x" | "y" | null
  // how far the mouse has gone since the axis was last weighed
  pending: { x: number; y: number }
}

export const startRulerDrag = (view: View, at: number): RulerDrag => ({
  view,
  time: view.start + at * (view.end - view.start),
  at,
  axis: null,
  pending: { x: 0, y: 0 },
})

/** The drag after the mouse moves by `move` pixels. */
export const moveRulerDrag = (
  drag: RulerDrag,
  move: { x: number; y: number },
  across: number,
  stepBeats: number,
): RulerDrag => {
  let pending = { x: drag.pending.x + move.x, y: drag.pending.y + move.y }
  let axis = drag.axis
  if (axis === null || Math.hypot(pending.x, pending.y) >= SWITCH_PIXELS) {
    axis = Math.abs(pending.x) > Math.abs(pending.y) ? "x" : "y"
    pending = { x: 0, y: 0 }
  }
  const view = zoomView(drag.view, {
    anchor: drag.at,
    at: axis === "x" ? drag.at + move.x / across : drag.at,
    dy: axis === "y" ? move.y : 0,
    stepBeats,
  })
  return {
    view,
    time: drag.time,
    // measured again, so a scroll held at the step's edge turns back at once
    at: (drag.time - view.start) / (view.end - view.start),
    axis,
    pending,
  }
}

// labels on the ruler are at least this far apart
const MIN_LABEL_GAP = 44
// the spacings a ruler labels at, in beats: sixteenths up to 16 bars
const LABEL_BEATS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]

export interface RulerMark {
  // beats from the step's start
  beat: number
  label: string
}

/**
 * Where a position on the step falls, counted as Live counts: bar, beat and
 * sixteenth from 1, with a bar or beat on its own as just that.
 */
export const positionLabel = (beat: number): string => {
  const sixteenths = Math.round(beat * 4)
  const bar = Math.floor(sixteenths / 16) + 1
  const inBar = Math.floor((sixteenths % 16) / 4) + 1
  const sixteenth = (sixteenths % 4) + 1
  if (sixteenths % 16 === 0) {
    return String(bar)
  }
  if (sixteenths % 4 === 0) {
    return `${bar}.${inBar}`
  }
  return `${bar}.${inBar}.${sixteenth}`
}

/**
 * The labelled positions a ruler shows across a view: as close together as
 * leaves room for their labels, on sixteenths, beats or bars.
 */
export const rulerMarks = (
  view: View,
  stepBeats: number,
  pixels: number,
): { every: number; marks: RulerMark[] } => {
  const from = view.start * stepBeats
  const to = view.end * stepBeats
  const perBeat = pixels / (to - from)
  const every =
    LABEL_BEATS.find((beats) => beats * perBeat >= MIN_LABEL_GAP) ??
    LABEL_BEATS[LABEL_BEATS.length - 1]
  const marks: RulerMark[] = []
  for (
    let beat = Math.ceil(from / every - 1e-9) * every;
    beat <= to + 1e-9;
    beat += every
  ) {
    marks.push({ beat, label: positionLabel(beat) })
  }
  return { every, marks }
}

// a band of the roll is at least this wide before it shades alone
const MIN_BAND_WIDTH = 80
// the lengths the roll's bands take, in beats: a beat's parts, then bars
const BAND_BEATS = [0.25, 0.5, 1, 4, 8, 16, 32, 64]

/**
 * How long each of the roll's alternating bands is, in beats, as in Live:
 * the shortest that is still wide enough to read as a column, so zoomed out
 * the roll shades by the bar and zoomed in by the beat or its parts.
 */
export const bandBeats = (
  view: View,
  stepBeats: number,
  pixels: number,
): number => {
  const perBeat = pixels / ((view.end - view.start) * stepBeats)
  return (
    BAND_BEATS.find((beats) => beats * perBeat >= MIN_BAND_WIDTH) ??
    BAND_BEATS[BAND_BEATS.length - 1]
  )
}
