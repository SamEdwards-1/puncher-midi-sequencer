import {
  ENVELOPE_MAX_VALUE,
  EnvelopePointJSON,
  EnvelopeShape,
  envelopeShape,
  modulationOf,
  modulationValueAt,
  PatchJSON,
  StepIndex,
  StepJSON,
  stepCount,
  VoiceIndex,
} from "@midiseq/core"

/** The stretch of the step on show, as fractions of it. */
export interface View {
  start: number
  end: number
}

export const WHOLE_STEP: View = { start: 0, end: 1 }

/**
 * Where the envelope is drawn: the step — or the part of it zoomed in on —
 * runs left to right and the CC value bottom to top, inset by `pad` so a
 * point at an edge is whole and can be grabbed.
 */
export interface Plot {
  width: number
  height: number
  pad: number
  view?: View
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const toX = ({ width, pad, view = WHOLE_STEP }: Plot, time: number) =>
  pad + ((time - view.start) / (view.end - view.start)) * (width - 2 * pad)

export const toY = ({ height, pad }: Plot, value: number) =>
  pad + (1 - value / ENVELOPE_MAX_VALUE) * (height - 2 * pad)

export const timeAtX = ({ width, pad, view = WHOLE_STEP }: Plot, x: number) =>
  clamp(
    view.start + ((x - pad) / (width - 2 * pad)) * (view.end - view.start),
    0,
    1,
  )

export const valueAtY = ({ height, pad }: Plot, y: number) =>
  clamp(
    (1 - (y - pad) / (height - 2 * pad)) * ENVELOPE_MAX_VALUE,
    0,
    ENVELOPE_MAX_VALUE,
  )

interface Segment {
  // as moveSegment counts them: -1 before the first point, the last index
  // after the last
  index: number
  from: EnvelopePointJSON
  to: EnvelopePointJSON
}

// The whole line: the flat stretch into the first point, the lines between
// points, and the flat stretch out of the last. Stepped, each point's value
// runs flat to the next point's time instead; the rises between are left
// to the points at either end of them.
const segmentsOf = (
  points: EnvelopePointJSON[],
  shape: EnvelopeShape,
): Segment[] => {
  if (points.length === 0) {
    return []
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (shape === "steps") {
    return [
      ...(first.time > 0
        ? [{ index: -1, from: { ...first, time: 0 }, to: first }]
        : []),
      ...points.map((from, index) => ({
        index,
        from,
        to: { time: points[index + 1]?.time ?? 1, value: from.value },
      })),
    ].filter(({ from, to }) => to.time > from.time)
  }
  return [
    ...(first.time > 0
      ? [{ index: -1, from: { ...first, time: 0 }, to: first }]
      : []),
    ...points.slice(1).map((to, index) => ({
      index,
      from: points[index],
      to,
    })),
    ...(last.time < 1
      ? [{ index: points.length - 1, from: last, to: { ...last, time: 1 } }]
      : []),
  ]
}

const distanceToLine = (
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const along =
    lengthSquared === 0
      ? 0
      : clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1)
  return Math.hypot(x - (x1 + along * dx), y - (y1 + along * dy))
}

/**
 * The point under (x, y), if one is within `radius`. Where points overlap,
 * the later one wins, as it is drawn on top.
 */
export const hitPoint = (
  points: EnvelopePointJSON[],
  plot: Plot,
  x: number,
  y: number,
  radius = 7,
): number | null => {
  let found: number | null = null
  let nearest = radius
  points.forEach((point, index) => {
    const distance = Math.hypot(
      toX(plot, point.time) - x,
      toY(plot, point.value) - y,
    )
    if (distance <= nearest) {
      nearest = distance
      found = index
    }
  })
  return found
}

/**
 * The vertex of the line as drawn under (x, y), if one is within `radius`,
 * by the point it belongs to. Stepped, a jump's other end is a vertex too:
 * one of the `stepCorners`.
 */
export const hitVertex = (
  points: EnvelopePointJSON[],
  plot: Plot,
  x: number,
  y: number,
  shape: EnvelopeShape = "ramps",
  radius = 7,
): number | null => {
  const vertices = [
    ...points.map((point, index) => ({ ...point, index })),
    ...(shape === "steps" ? stepCorners(points) : []),
  ]
  let found: number | null = null
  let nearest = radius
  for (const vertex of vertices) {
    const distance = Math.hypot(
      toX(plot, vertex.time) - x,
      toY(plot, vertex.value) - y,
    )
    if (distance <= nearest) {
      nearest = distance
      found = vertex.index
    }
  }
  return found
}

// The segment of the line under (x, y), if one is within `tolerance`.
export const hitSegment = (
  points: EnvelopePointJSON[],
  plot: Plot,
  x: number,
  y: number,
  shape: EnvelopeShape = "ramps",
  tolerance = 5,
): number | null => {
  let found: number | null = null
  let nearest = tolerance
  for (const { index, from, to } of segmentsOf(points, shape)) {
    const distance = distanceToLine(
      x,
      y,
      toX(plot, from.time),
      toY(plot, from.value),
      toX(plot, to.time),
      toY(plot, to.value),
    )
    if (distance <= nearest) {
      nearest = distance
      found = index
    }
  }
  return found
}

/** A note's bar in the piano roll, where it is drawn. */
export interface Bar {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The bar under (x, y), if one is. A bar narrower or shorter than `least`
 * reaches out to that much across, so a short note on a crowded roll can
 * still be pointed at. Where bars overlap under the point the later one
 * wins, as it is drawn on top; failing any under it, the nearest reaching it.
 */
export const hitBar = (
  bars: Bar[],
  x: number,
  y: number,
  least = 6,
): number | null => {
  let found: number | null = null
  let nearest = Number.POSITIVE_INFINITY
  bars.forEach((bar, index) => {
    // how far the point lies off the bar, sideways and up or down
    const offX = Math.max(bar.x - x, x - (bar.x + bar.width), 0)
    const offY = Math.max(bar.y - y, y - (bar.y + bar.height), 0)
    if (
      offX > Math.max(0, (least - bar.width) / 2) ||
      offY > Math.max(0, (least - bar.height) / 2)
    ) {
      return
    }
    const distance = Math.hypot(offX, offY)
    if (distance <= nearest) {
      nearest = distance
      found = index
    }
  })
  return found
}

// hundredths of a pixel are plenty, and keep float noise out of the path
const px = (value: number) => Math.round(value * 100) / 100

/**
 * Where a stepped line turns to rise or fall: at each point's time, at the
 * value held before it. Shown as handles in their own right, as Live shows
 * both ends of a jump, though only the point after it moves. Each belongs
 * to the point whose value it is held at, `index`, as the flat stretch
 * between them does.
 */
export const stepCorners = (
  points: EnvelopePointJSON[],
): (EnvelopePointJSON & { index: number })[] =>
  points.slice(1).flatMap((point, index) => {
    const before = points[index]
    return point.value === before.value
      ? []
      : [{ time: point.time, value: before.value, index }]
  })

// The line across the whole step, flat before the first point and after the
// last, as an SVG path; stepped, flat from each point to the next and then
// straight up or down.
export const linePath = (
  points: EnvelopePointJSON[],
  plot: Plot,
  shape: EnvelopeShape = "ramps",
): string => {
  if (points.length === 0) {
    return ""
  }
  const first = points[0]
  const last = points[points.length - 1]
  const corners = [
    { time: 0, value: first.value },
    ...(shape === "steps"
      ? points.flatMap((point, index) =>
          index === 0
            ? [point]
            : [{ time: point.time, value: points[index - 1].value }, point],
        )
      : points),
    { time: 1, value: last.value },
  ]
  return corners
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${px(toX(plot, point.time))},${px(toY(plot, point.value))}`,
    )
    .join(" ")
}

// The line closed along the bottom, to shade what lies under it.
export const areaPath = (
  points: EnvelopePointJSON[],
  plot: Plot,
  shape: EnvelopeShape = "ramps",
): string => {
  if (points.length === 0) {
    return ""
  }
  const bottom = px(toY(plot, 0))
  return `${linePath(points, plot, shape)} L${px(toX(plot, 1))},${bottom} L${px(toX(plot, 0))},${bottom} Z`
}

// The grid cell a time falls in, on lines from gridTimes.
export const cellAt = (grid: number[], time: number): number => {
  for (let index = grid.length - 2; index >= 0; index--) {
    if (time >= grid[index]) {
      return index
    }
  }
  return 0
}

// the notes of a step the voices can play, as far as the note limit goes
const playable = (patch: PatchJSON, step: StepJSON) =>
  [...step.notes].sort((a, b) => a - b).slice(0, patch.maxNotesPerStep)

/**
 * The transposes a step's notes are played at: each playing voice's own, or
 * where the step modulates it, those its envelope moves it to — every one
 * between the envelope's points, where they ramp.
 */
export const stepTransposes = (patch: PatchJSON, index: StepIndex): number[] =>
  patch.voices.flatMap((voice, at) => {
    if (!voice.enabled) {
      return []
    }
    const modulation = modulationOf(patch, {
      kind: "voice",
      voice: at as VoiceIndex,
      setting: "transposeAmt",
    })
    const envelope =
      modulation === undefined
        ? undefined
        : patch.steps[index].envelopes.find(({ cc }) => cc === modulation.cc)
    if (
      modulation === undefined ||
      envelope === undefined ||
      envelope.points.length === 0
    ) {
      return [voice.transposeAmt]
    }
    const reached = envelope.points.map(
      ({ value }) => modulationValueAt(modulation, value) as number,
    )
    if (envelopeShape(envelope) === "steps") {
      return reached
    }
    const low = Math.min(...reached)
    return Array.from(
      { length: Math.max(...reached) - low + 1 },
      (_, index) => low + index,
    )
  })

/**
 * The lowest and highest keys the grid holds or its voices play: every
 * step's notes, as far as the note limit goes, and those notes moved by each
 * playing voice's transpose, or the transposes a step modulates it to. Taken
 * across all the steps rather than the one on show, so the piano roll holds
 * still from step to step, and moves only when a note or a transpose takes it
 * further.
 */
export const patchNoteSpan = (patch: PatchJSON): number[] => {
  const steps = patch.steps.slice(0, stepCount(patch.size))
  const keys = steps.flatMap((step) => playable(patch, step))
  if (keys.length === 0) {
    return []
  }
  const low = Math.min(...keys)
  const high = Math.max(...keys)
  const transposes = new Set(
    steps.flatMap((_, index) => stepTransposes(patch, index)),
  )
  return [low, high].flatMap((key) =>
    [0, ...transposes].map((semitones) => clamp(key + semitones, 0, 127)),
  )
}

/**
 * Every key the grid's notes sound on, with the scale collapsed: each
 * step's notes, as far as the note limit goes, as they are and moved by
 * each playing voice's transpose on that step — the keys patchNoteSpan spans.
 */
export const patchNoteKeys = (patch: PatchJSON): number[] => {
  const keys = new Set(
    patch.steps.slice(0, stepCount(patch.size)).flatMap((step, index) => {
      const transposes = [0, ...stepTransposes(patch, index)]
      return playable(patch, step).flatMap((note) =>
        transposes.map((semitones) => clamp(note + semitones, 0, 127)),
      )
    }),
  )
  return [...keys].sort((a, b) => a - b)
}

/**
 * The piano roll's rows, top to bottom: every key from the lowest to the
 * highest the grid plays, or collapsed, only the keys it plays. With nothing
 * played, collapsing leaves the whole range.
 */
export const pianoRows = (patch: PatchJSON, collapsed: boolean): number[] => {
  const played = patchNoteKeys(patch)
  if (collapsed && played.length > 0) {
    return played.reverse()
  }
  const { low, high } = keyRange(patchNoteSpan(patch))
  return Array.from({ length: high - low + 1 }, (_, offset) => high - offset)
}

/**
 * The keys the piano roll shows: exactly the lowest to the highest of
 * `notes`, so its bottom row is the lowest note anything plays and its top
 * row the highest. With no notes, the octave around middle C.
 */
export const keyRange = (notes: number[]): { low: number; high: number } =>
  notes.length === 0
    ? { low: 54, high: 66 }
    : { low: Math.min(...notes), high: Math.max(...notes) }

const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

export const isBlackKey = (note: number) => BLACK_KEYS.has(note % 12)
