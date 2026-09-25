import { EnvelopeJSON, EnvelopePointJSON, EnvelopeShape } from "./types"

export const ENVELOPE_MAX_VALUE = 127

const clampValue = (value: number) =>
  Math.min(ENVELOPE_MAX_VALUE, Math.max(0, Math.round(value)))

const clampTime = (time: number) => Math.min(1, Math.max(0, time))

// Times come from pixels and grid fractions; rounding keeps a snapped time
// such as 1/3 comparable with the same time reached another way.
const TIME_DIGITS = 1e9
const tidyTime = (time: number) =>
  Math.round(clampTime(time) * TIME_DIGITS) / TIME_DIGITS

// An envelope saved before envelopes could step is a ramp.
export const envelopeShape = (envelope: EnvelopeJSON): EnvelopeShape =>
  envelope.shape ?? "ramps"

/**
 * The envelope's value at `time`: each point's value held until the next
 * point, or straight lines between them; the first point's value before it
 * and the last point's after it. Where two points share a time the later
 * one wins, so a jump takes effect at its time. Null for an envelope with
 * no points, which sends nothing.
 */
export const valueAt = (
  points: EnvelopePointJSON[],
  time: number,
  shape: EnvelopeShape = "ramps",
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
      if (shape === "steps" || next === undefined || next.time === point.time) {
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
  shape: EnvelopeShape = "ramps",
): EnvelopePointJSON[] => {
  const value = valueAt(points, time, shape)
  // where a point already is, the line has its handle
  const taken = points.some((point) => point.time === tidyTime(time))
  return value === null || taken ? points : insertPoint(points, { time, value })
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
 * to the next, so both move — or stepped, it is point `index` holding its
 * value, and only that point moves; -1 is the flat stretch before the first
 * point and the last index the stretch after the last, each moving its one
 * point.
 */
export const moveSegment = (
  points: EnvelopePointJSON[],
  index: number,
  delta: number,
  shape: EnvelopeShape = "ramps",
): EnvelopePointJSON[] => {
  const ends =
    index < 0
      ? [0]
      : index >= points.length - 1
        ? [points.length - 1]
        : shape === "steps"
          ? [index]
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
 * Stepped, the old value already holds up to the stroke, so only its end is
 * pinned, and a painted point at the value before it adds nothing.
 */
export const paintPoints = (
  points: EnvelopePointJSON[],
  from: number,
  to: number,
  stroke: EnvelopePointJSON[],
  shape: EnvelopeShape = "ramps",
): EnvelopePointJSON[] => {
  const start = tidyTime(Math.min(from, to))
  const end = tidyTime(Math.max(from, to))
  const before = points.filter((point) => point.time < start)
  const after = points.filter((point) => point.time > end)
  const oldStart = valueAt(points, start, shape)
  const oldEnd = valueAt(points, end, shape)

  const painted = [...stroke]
    .map((point) => ({
      time: tidyTime(point.time),
      value: clampValue(point.value),
    }))
    .sort((a, b) => a.time - b.time)

  // Nothing comes before the step's start or after its end, so there is no
  // old shape to keep there.
  const keepStart = oldStart !== null && start > 0 && shape === "ramps"
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
  if (shape === "steps") {
    // each value holds until the next, so a repeat is no change at all
    return distinct.filter(
      (point, index) =>
        index === 0 ||
        point.time < start ||
        point.time > end ||
        point.value !== distinct[index - 1].value,
    )
  }
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

/**
 * Thins a run of points to the ones that give it its shape. A point goes
 * when the line between the points kept either side of it passes within
 * `tolerance` of its value, so a steady sweep keeps its two ends and a
 * curve keeps its bends. At the default of half a step, nothing that plays
 * moves by more than one, since the engine sends rounded values.
 *
 * Meant for a stroke played in — a knob's run of messages — before it is
 * laid over an envelope; the ends are always kept.
 */
export const simplifyPoints = (
  points: EnvelopePointJSON[],
  tolerance = 0.5,
): EnvelopePointJSON[] => {
  if (points.length <= 2) {
    return points
  }
  const keep = points.map(
    (_, index) => index === 0 || index === points.length - 1,
  )
  const ranges: [number, number][] = [[0, points.length - 1]]
  while (ranges.length > 0) {
    const range = ranges.pop()
    if (range === undefined) {
      break
    }
    const [first, last] = range
    const a = points[first]
    const b = points[last]
    const span = b.time - a.time
    let farthest = -1
    let distance = tolerance
    for (let index = first + 1; index < last; index++) {
      const point = points[index]
      const expected =
        span === 0
          ? a.value
          : a.value + ((b.value - a.value) * (point.time - a.time)) / span
      const off = Math.abs(point.value - expected)
      if (off > distance) {
        distance = off
        farthest = index
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true
      ranges.push([first, farthest], [farthest, last])
    }
  }
  return points.filter((_, index) => keep[index])
}

/**
 * Thins a run of stepped points to the ones where the value changes: each
 * holds until the next, so a point at the value before it changes nothing.
 * The first is always kept.
 */
export const dropRepeats = (points: EnvelopePointJSON[]): EnvelopePointJSON[] =>
  points.filter(
    (point, index) => index === 0 || point.value !== points[index - 1].value,
  )

/**
 * Stored times are beats from the step's start; the editing tools here work
 * in fractions of a step, 0 to its end at 1. These convert between the two
 * for a step `stepBeats` long. A point past the step's end comes out beyond
 * 1: the tools leave such points where they are unless one is moved, so an
 * envelope made on a longer step keeps what doesn't fit, and it plays again
 * if the pace grows back.
 */
export const toStepTimes = (
  points: EnvelopePointJSON[],
  stepBeats: number,
): EnvelopePointJSON[] =>
  points.map((point) => ({ ...point, time: point.time / stepBeats }))

export const toBeatTimes = (
  points: EnvelopePointJSON[],
  stepBeats: number,
): EnvelopePointJSON[] =>
  points.map((point) => ({
    ...point,
    time: Math.round(point.time * stepBeats * TIME_DIGITS) / TIME_DIGITS,
  }))
