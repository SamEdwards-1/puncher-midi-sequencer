import { EnvelopePointJSON } from "./types"

export const ENVELOPE_MAX_VALUE = 127

const clampValue = (value: number) =>
  Math.min(ENVELOPE_MAX_VALUE, Math.max(0, Math.round(value)))

const clampTime = (time: number) => Math.min(1, Math.max(0, time))

// Times come from pixels and grid fractions; rounding keeps a snapped time
// such as 1/3 comparable with the same time reached another way.
const TIME_DIGITS = 1e9
const tidyTime = (time: number) =>
  Math.round(clampTime(time) * TIME_DIGITS) / TIME_DIGITS

/**
 * The envelope's value at `time`: straight lines between points, the first
 * point's value before it and the last point's after it. Where two points
 * share a time the later one wins, so a jump takes effect at its time. Null
 * for an envelope with no points, which sends nothing.
 */
export const valueAt = (
  points: EnvelopePointJSON[],
  time: number,
): number | null => {
  if (points.length === 0) {
    return null
  }
  if (time < points[0].time) {
    return points[0].value
  }
  for (let index = points.length - 1; index >= 0; index--) {
    const point = points[index]
    if (point.time <= time) {
      const next = points[index + 1]
      if (next === undefined || next.time === point.time) {
        return point.value
      }
      const along = (time - point.time) / (next.time - point.time)
      return point.value + (next.value - point.value) * along
    }
  }
  return points[0].value
}

/**
 * A grid of note values laid over one step: `gridBeats` long divisions of a
 * step `stepBeats` long, as fractions of the step. The step's end is always
 * a line, even where the grid doesn't divide the step evenly.
 */
export const gridTimes = (stepBeats: number, gridBeats: number): number[] => {
  const times: number[] = []
  const count = Math.floor(stepBeats / gridBeats + 1e-9)
  for (let index = 0; index <= count; index++) {
    times.push(tidyTime((index * gridBeats) / stepBeats))
  }
  if (times[times.length - 1] !== 1) {
    times.push(1)
  }
  return times
}

// The grid line nearest `time`.
export const snapTime = (
  time: number,
  stepBeats: number,
  gridBeats: number,
): number =>
  gridTimes(stepBeats, gridBeats).reduce((nearest, line) =>
    Math.abs(line - time) < Math.abs(nearest - time) ? line : nearest,
  )

/** Adds a point where it belongs in time, after any already at that time. */
export const insertPoint = (
  points: EnvelopePointJSON[],
  point: EnvelopePointJSON,
): EnvelopePointJSON[] => {
  const added = { time: tidyTime(point.time), value: clampValue(point.value) }
  const at = points.findIndex((existing) => existing.time > added.time)
  return at === -1
    ? [...points, added]
    : [...points.slice(0, at), added, ...points.slice(at)]
}

/**
 * Adds a point on the line at `time`, so the shape is unchanged until the
 * point is dragged. An empty envelope has no line to add to.
 */
export const insertPointOnLine = (
  points: EnvelopePointJSON[],
  time: number,
): EnvelopePointJSON[] => {
  const value = valueAt(points, time)
  return value === null ? points : insertPoint(points, { time, value })
}

/**
 * Moves one point, keeping it between its neighbours in time so the order
 * — and so the shape either side — stays as it was.
 */
export const movePoint = (
  points: EnvelopePointJSON[],
  index: number,
  time: number,
  value: number,
): EnvelopePointJSON[] => {
  const earliest = points[index - 1]?.time ?? 0
  const latest = points[index + 1]?.time ?? 1
  const moved = {
    time: tidyTime(Math.min(latest, Math.max(earliest, time))),
    value: clampValue(value),
  }
  return points.map((point, current) => (current === index ? moved : point))
}

/**
 * Raises or lowers a whole segment. Segment `index` runs from point `index`
 * to the next, so both move; -1 is the flat stretch before the first point
 * and the last index the stretch after the last, each moving its one point.
 */
export const moveSegment = (
  points: EnvelopePointJSON[],
  index: number,
  delta: number,
): EnvelopePointJSON[] => {
  const ends =
    index < 0
      ? [0]
      : index >= points.length - 1
        ? [points.length - 1]
        : [index, index + 1]
  return points.map((point, current) =>
    ends.includes(current)
      ? { ...point, value: clampValue(point.value + delta) }
      : point,
  )
}

export const removePoint = (
  points: EnvelopePointJSON[],
  index: number,
): EnvelopePointJSON[] => points.filter((_, current) => current !== index)

/**
 * Lays `stroke` — points painted between `from` and `to` — over the
 * envelope, replacing whatever was there. The shape either side is kept by
 * pinning the old value at both ends, so the painted stretch joins it with a
 * jump; points that come out identical to their neighbour are dropped.
 */
export const paintPoints = (
  points: EnvelopePointJSON[],
  from: number,
  to: number,
  stroke: EnvelopePointJSON[],
): EnvelopePointJSON[] => {
  const start = tidyTime(Math.min(from, to))
  const end = tidyTime(Math.max(from, to))
  const before = points.filter((point) => point.time < start)
  const after = points.filter((point) => point.time > end)
  const oldStart = valueAt(points, start)
  const oldEnd = valueAt(points, end)

  const painted = [...stroke]
    .map((point) => ({
      time: tidyTime(point.time),
      value: clampValue(point.value),
    }))
    .sort((a, b) => a.time - b.time)

  // Nothing comes before the step's start or after its end, so there is no
  // old shape to keep there.
  const keepStart = oldStart !== null && start > 0
  const keepEnd = oldEnd !== null && end < 1
  const joined = [
    ...before,
    ...(keepStart ? [{ time: start, value: clampValue(oldStart) }] : []),
    ...painted,
    ...(keepEnd ? [{ time: end, value: clampValue(oldEnd) }] : []),
    ...after,
  ]
  const distinct = joined.filter(
    (point, index) =>
      index === 0 ||
      point.time !== joined[index - 1].time ||
      point.value !== joined[index - 1].value,
  )
  // A painted run at one value needs only its two ends; the points between
  // would be handles on a flat line. Points outside the stroke are left be.
  return distinct.filter((point, index) => {
    const previous = distinct[index - 1]
    const next = distinct[index + 1]
    const inStroke = point.time > start && point.time < end
    return !(
      inStroke &&
      previous !== undefined &&
      next !== undefined &&
      previous.value === point.value &&
      next.value === point.value &&
      previous.time < point.time &&
      point.time < next.time
    )
  })
}

/**
 * The flat steps a grid-quantised stroke paints: each painted grid cell
 * holds its value from one line to the next. `cells` maps a cell's index on
 * `grid` (from `gridTimes`) to its value.
 */
export const stairsFor = (
  grid: number[],
  cells: Map<number, number>,
): { from: number; to: number; stroke: EnvelopePointJSON[] } | null => {
  const indexes = [...cells.keys()].sort((a, b) => a - b)
  if (indexes.length === 0) {
    return null
  }
  const stroke = indexes.flatMap((index) => {
    const value = cells.get(index) ?? 0
    return [
      { time: grid[index], value },
      { time: grid[index + 1], value },
    ]
  })
  return {
    from: grid[indexes[0]],
    to: grid[indexes[indexes.length - 1] + 1],
    stroke,
  }
}
