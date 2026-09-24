import { describe, expect, it } from "vitest"
import {
  gridTimes,
  insertPoint,
  insertPointOnLine,
  movePoint,
  moveSegment,
  paintPoints,
  removePoint,
  simplifyPoints,
  snapTime,
  stairsFor,
  valueAt,
} from "./envelope"

const ramp = [
  { time: 0.25, value: 0 },
  { time: 0.75, value: 100 },
]

describe("envelopes", () => {
  describe("reading a value", () => {
    it("draws straight lines between points", () => {
      expect(valueAt(ramp, 0.5)).toBe(50)
      expect(valueAt(ramp, 0.25)).toBe(0)
      expect(valueAt(ramp, 0.75)).toBe(100)
    })

    it("holds the first value before it and the last after it", () => {
      expect(valueAt(ramp, 0)).toBe(0)
      expect(valueAt(ramp, 1)).toBe(100)
    })

    it("jumps at two points sharing a time, taking the later", () => {
      const jump = [
        { time: 0, value: 10 },
        { time: 0.5, value: 10 },
        { time: 0.5, value: 90 },
      ]
      expect(valueAt(jump, 0.49)).toBe(10)
      expect(valueAt(jump, 0.5)).toBe(90)
    })

    it("has no value without points", () => {
      expect(valueAt([], 0.5)).toBeNull()
    })
  })

  describe("the grid", () => {
    it("divides a step into note values", () => {
      // a bar of 16ths
      expect(gridTimes(4, 0.25)).toHaveLength(17)
      expect(gridTimes(1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1])
    })

    it("always ends on the step's end", () => {
      // a dotted quarter of 8ths: three lines and the end
      expect(gridTimes(1.5, 0.5)).toEqual([0, 1 / 3, 2 / 3, 1].map(round))
      // a grid coarser than the step still has both ends
      expect(gridTimes(0.25, 1)).toEqual([0, 1])
    })

    it("snaps to the nearest line", () => {
      expect(snapTime(0.3, 1, 0.25)).toBe(0.25)
      expect(snapTime(0.9, 1, 0.25)).toBe(1)
      // a triplet grid lands on thirds exactly
      expect(snapTime(0.3, 1, 1 / 3)).toBe(round(1 / 3))
    })
  })

  describe("editing points", () => {
    it("adds a point in time order, after any at the same time", () => {
      const jump = insertPoint(ramp, { time: 0.75, value: 20 })
      expect(jump).toEqual([...ramp, { time: 0.75, value: 20 }])
      expect(insertPoint(ramp, { time: 0.5, value: 400 })[1]).toEqual({
        time: 0.5,
        value: 127,
      })
    })

    it("adds a point on the line without changing the shape", () => {
      const added = insertPointOnLine(ramp, 0.5)
      expect(added).toHaveLength(3)
      expect(added[1]).toEqual({ time: 0.5, value: 50 })
      for (const time of [0, 0.3, 0.5, 0.6, 1]) {
        expect(valueAt(added, time)).toBeCloseTo(valueAt(ramp, time) ?? -1)
      }
      // an empty envelope has no line to add to
      expect(insertPointOnLine([], 0.5)).toEqual([])
    })

    it("moves a point, but never past its neighbours", () => {
      const three = insertPoint(ramp, { time: 0.5, value: 50 })
      expect(movePoint(three, 1, 0.6, 70)[1]).toEqual({ time: 0.6, value: 70 })
      expect(movePoint(three, 1, 0.9, 70)[1].time).toBe(0.75)
      expect(movePoint(three, 1, 0.1, 70)[1].time).toBe(0.25)
      // and only within the step and the CC range
      expect(movePoint(ramp, 0, -1, -5)[0]).toEqual({ time: 0, value: 0 })
      expect(movePoint(ramp, 1, 2, 999)[1]).toEqual({ time: 1, value: 127 })
    })

    it("rounds a moved value to a whole CC value", () => {
      expect(movePoint(ramp, 0, 0.25, 33.6)[0].value).toBe(34)
    })

    it("raises a segment by both its ends", () => {
      const three = [...ramp, { time: 1, value: 20 }]
      expect(moveSegment(three, 0, 10)).toEqual([
        { time: 0.25, value: 10 },
        { time: 0.75, value: 110 },
        { time: 1, value: 20 },
      ])
    })

    it("raises the flat stretch before the first point or after the last by its one point", () => {
      expect(moveSegment(ramp, -1, 5)).toEqual([
        { time: 0.25, value: 5 },
        ramp[1],
      ])
      expect(moveSegment(ramp, 1, -30)).toEqual([
        ramp[0],
        { time: 0.75, value: 70 },
      ])
    })

    it("keeps a raised segment inside the CC range", () => {
      expect(moveSegment(ramp, 0, 50).map((point) => point.value)).toEqual([
        50, 127,
      ])
    })

    it("removes a point, joining its neighbours", () => {
      const three = insertPoint(ramp, { time: 0.5, value: 0 })
      expect(removePoint(three, 1)).toEqual(ramp)
    })
  })

  describe("painting", () => {
    const flat = [
      { time: 0, value: 60 },
      { time: 1, value: 60 },
    ]

    it("replaces the painted stretch and keeps the shape either side", () => {
      const painted = paintPoints(flat, 0.25, 0.5, [
        { time: 0.25, value: 100 },
        { time: 0.5, value: 100 },
      ])
      expect(valueAt(painted, 0.1)).toBe(60)
      expect(valueAt(painted, 0.3)).toBe(100)
      expect(valueAt(painted, 0.6)).toBe(60)
      // joined to the old line by jumps at both ends
      expect(painted).toEqual([
        { time: 0, value: 60 },
        { time: 0.25, value: 60 },
        { time: 0.25, value: 100 },
        { time: 0.5, value: 100 },
        { time: 0.5, value: 60 },
        { time: 1, value: 60 },
      ])
    })

    it("drops points the stroke paints over", () => {
      const busy = [
        { time: 0, value: 0 },
        { time: 0.3, value: 127 },
        { time: 0.4, value: 0 },
        { time: 1, value: 0 },
      ]
      const painted = paintPoints(busy, 0.25, 0.5, [
        { time: 0.25, value: 64 },
        { time: 0.5, value: 64 },
      ])
      expect(painted.some((point) => point.time === 0.3)).toBe(false)
      expect(painted.some((point) => point.time === 0.4)).toBe(false)
    })

    it("paints an empty envelope with the stroke alone", () => {
      const stroke = [
        { time: 0.25, value: 10 },
        { time: 0.5, value: 20 },
      ]
      expect(paintPoints([], 0.25, 0.5, stroke)).toEqual(stroke)
    })

    it("keeps only the ends of a flat run it paints", () => {
      const cells = new Map([
        [0, 90],
        [1, 90],
        [2, 90],
      ])
      const stairs = stairsFor(gridTimes(1, 0.25), cells)
      if (stairs === null) {
        throw new Error("no stairs")
      }
      const painted = paintPoints(flat, stairs.from, stairs.to, stairs.stroke)
      // from the step's start, with nothing before it to keep
      expect(painted).toEqual([
        { time: 0, value: 90 },
        { time: 0.75, value: 90 },
        { time: 0.75, value: 60 },
        { time: 1, value: 60 },
      ])
    })

    it("turns painted grid cells into flat steps", () => {
      const stairs = stairsFor(
        gridTimes(1, 0.25),
        new Map([
          [2, 30],
          [1, 10],
        ]),
      )
      expect(stairs).toEqual({
        from: 0.25,
        to: 0.75,
        stroke: [
          { time: 0.25, value: 10 },
          { time: 0.5, value: 10 },
          { time: 0.5, value: 30 },
          { time: 0.75, value: 30 },
        ],
      })
      expect(stairsFor(gridTimes(1, 0.25), new Map())).toBeNull()
    })
  })
})

function round(time: number) {
  return Math.round(time * 1e9) / 1e9
}

describe("simplifyPoints", () => {
  // a knob swept steadily from 0 to 100, one message every 1/48 of the step
  const sweep = Array.from({ length: 49 }, (_, index) => ({
    time: index / 48,
    value: Math.round((index / 48) * 100),
  }))

  it("keeps only the ends of a steady sweep", () => {
    expect(simplifyPoints(sweep)).toEqual([
      { time: 0, value: 0 },
      { time: 1, value: 100 },
    ])
  })

  it("keeps the bend in a sweep that turns round", () => {
    const upAndDown = [
      ...sweep.slice(0, 25),
      ...sweep.slice(1, 25).map((point) => ({
        time: 0.5 + point.time,
        value: 50 - point.value,
      })),
    ]
    const thinned = simplifyPoints(upAndDown)
    expect(thinned).toHaveLength(3)
    expect(thinned[1]).toEqual({ time: 0.5, value: 50 })
  })

  it("never moves what plays by more than one", () => {
    const wobbly = sweep.map((point, index) => ({
      ...point,
      value: point.value + (index % 3 === 0 ? 3 : 0),
    }))
    const thinned = simplifyPoints(wobbly)
    for (const point of wobbly) {
      const played = Math.round(valueAt(thinned, point.time) ?? 0)
      expect(Math.abs(played - point.value)).toBeLessThanOrEqual(1)
    }
  })

  it("leaves one or two points alone", () => {
    expect(simplifyPoints([{ time: 0.3, value: 9 }])).toEqual([
      { time: 0.3, value: 9 },
    ])
    expect(simplifyPoints([])).toEqual([])
  })
})
