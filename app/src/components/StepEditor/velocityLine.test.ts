import { StepNote } from "@midiseq/core"
import { describe, expect, it } from "vitest"
import { Plot } from "./envelopeGeometry"
import {
  dotKey,
  hitLollipop,
  pointsAlong,
  velocityPoints,
} from "./velocityLine"

// 100 pixels of step inside a 10 pixel inset
const plot: Plot = { width: 120, height: 147, pad: 10 }
const toYOf = (value: number) => 10 + (1 - value / 127) * 127
const note = (
  voice: 0 | 1 | 2 | 3,
  dot: number,
  start: number,
  velocity = 64,
): StepNote => ({ voice, dot, start, end: start + 0.1, note: 60, velocity })

describe("velocity lollipops", () => {
  const notes = [note(0, 1, 0.5, 40), note(1, 0, 0.25, 90), note(0, 0, 0)]

  it("has one for each of its voice's notes, as long as the note, in time order", () => {
    expect(velocityPoints(notes, 0)).toEqual([
      { voice: 0, dot: 0, time: 0, end: 0.1, value: 64 },
      { voice: 0, dot: 1, time: 0.5, end: 0.6, value: 40 },
    ])
    expect(velocityPoints(notes, 1)).toHaveLength(1)
    expect(velocityPoints(notes, 2)).toEqual([])
  })

  it("takes a stroke's value where it crosses a point, in either direction", () => {
    const points = [
      ...velocityPoints(notes, 0),
      { voice: 0 as const, dot: 2, time: 1, end: 1, value: 64 },
    ]
    // from x 10 at 0 to x 110 at 100
    const crossed = pointsAlong(
      points,
      plot,
      { x: 10, value: 0 },
      { x: 110, value: 100 },
    )
    expect(crossed.map(({ value }) => value)).toEqual([0, 50, 100])

    // right to left over the middle one only
    const back = pointsAlong(
      points,
      plot,
      { x: 80, value: 10 },
      { x: 40, value: 30 },
    )
    expect(back).toEqual([{ point: points[1], value: 20 }])
  })

  it("is caught by its head or anywhere along its stem", () => {
    // heads at x 10 and 60, each stem 10 pixels long; 64 is y 10 + 63
    const points = velocityPoints(notes, 0)
    expect(hitLollipop(points, plot, 12, 75)).toBe(0)
    expect(hitLollipop(points, plot, 18, 73)).toBe(0)
    // 40 is y 10 + 87
    expect(hitLollipop(points, plot, 67, 99)).toBe(1)
    // past a stem's end, above it, or between notes
    expect(hitLollipop(points, plot, 30, 73)).toBeNull()
    expect(hitLollipop(points, plot, 15, 60)).toBeNull()
    expect(hitLollipop(points, plot, 40, 85)).toBeNull()
  })

  it("is caught by the nearest where two overlap", () => {
    const points = velocityPoints([note(0, 0, 0, 64), note(0, 1, 0.05, 60)], 0)
    // on the first's stem, but nearer the second's head
    expect(hitLollipop(points, plot, 15, toYOf(60))).toBe(1)
    expect(hitLollipop(points, plot, 12, toYOf(64))).toBe(0)
  })

  it("belongs to its dot, so one dot's points move together", () => {
    expect(dotKey(note(2, 5, 0))).toBe(dotKey(note(2, 5, 0.75)))
    expect(dotKey(note(2, 5, 0))).not.toBe(dotKey(note(3, 5, 0)))
  })
})
