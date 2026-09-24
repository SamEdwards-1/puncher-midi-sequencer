import {
  ENVELOPE_MAX_VALUE,
  EnvelopePointJSON,
  PatchJSON,
  stepCount,
} from "@midiseq/core"

/**
 * Where the envelope is drawn: the step runs left to right and the CC value
 * bottom to top, inset by `pad` so a point at an edge is whole and can be
 * grabbed.
 */
export interface Plot {
  width: number
  height: number
  pad: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const toX = ({ width, pad }: Plot, time: number) =>
  pad + time * (width - 2 * pad)

export const toY = ({ height, pad }: Plot, value: number) =>
  pad + (1 - value / ENVELOPE_MAX_VALUE) * (height - 2 * pad)

export const timeAtX = ({ width, pad }: Plot, x: number) =>
  clamp((x - pad) / (width - 2 * pad), 0, 1)

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
// points, and the flat stretch out of the last.
const segmentsOf = (points: EnvelopePointJSON[]): Segment[] => {
  if (points.length === 0) {
    return []
  }
  const first = points[0]
  const last = points[points.length - 1]
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

// The segment of the line under (x, y), if one is within `tolerance`.
export const hitSegment = (
  points: EnvelopePointJSON[],
  plot: Plot,
  x: number,
  y: number,
  tolerance = 5,
): number | null => {
  let found: number | null = null
  let nearest = tolerance
  for (const { index, from, to } of segmentsOf(points)) {
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

// hundredths of a pixel are plenty, and keep float noise out of the path
const px = (value: number) => Math.round(value * 100) / 100

// The line across the whole step, flat before the first point and after the
// last, as an SVG path.
export const linePath = (points: EnvelopePointJSON[], plot: Plot): string => {
  if (points.length === 0) {
    return ""
  }
  const first = points[0]
  const last = points[points.length - 1]
  const corners = [
    { time: 0, value: first.value },
    ...points,
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
export const areaPath = (points: EnvelopePointJSON[], plot: Plot): string => {
  if (points.length === 0) {
    return ""
  }
  const bottom = px(toY(plot, 0))
  return `${linePath(points, plot)} L${px(toX(plot, 1))},${bottom} L${px(toX(plot, 0))},${bottom} Z`
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

/**
 * The lowest and highest notes the whole patch can play: every step's notes
 * the voices can reach, moved by the furthest offsets any voice has. Taken
 * across all the steps rather than the one on show, so the piano roll holds
 * still from step to step and while notes and dots are edited.
 */
export const patchNoteSpan = (patch: PatchJSON): number[] => {
  const notes = patch.steps
    .slice(0, stepCount(patch.size))
    .flatMap((step) =>
      [...step.notes].sort((a, b) => a - b).slice(0, patch.maxNotesPerStep),
    )
  if (notes.length === 0) {
    return []
  }
  const offsets = patch.voices.map((voice) => voice.offset)
  const inRange = (note: number) => Math.min(127, Math.max(0, note))
  return [
    inRange(Math.min(...notes) + Math.min(...offsets)),
    inRange(Math.max(...notes) + Math.max(...offsets)),
  ]
}

/**
 * The keys the piano roll shows: the notes with a key to spare either side,
 * and at least an octave, so a single note doesn't fill the height. With no
 * notes, the octave around middle C.
 */
export const keyRange = (
  notes: number[],
  minimum = 13,
): { low: number; high: number } => {
  if (notes.length === 0) {
    return { low: 54, high: 66 }
  }
  let low = Math.max(0, Math.min(...notes) - 1)
  let high = Math.min(127, Math.max(...notes) + 1)
  while (high - low + 1 < minimum) {
    if (low > 0) {
      low--
    }
    if (high - low + 1 < minimum && high < 127) {
      high++
    }
  }
  return { low, high }
}

const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

export const isBlackKey = (note: number) => BLACK_KEYS.has(note % 12)
