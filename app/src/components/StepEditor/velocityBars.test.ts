import { StepNote } from "@midiseq/core"
import { describe, expect, it } from "vitest"
import { Plot } from "./envelopeGeometry"
import { BAR_WIDTH, barsAlong, barsAt, barsFor, dotKey } from "./velocityBars"

// 100 pixels of step inside a 10 pixel inset
const plot: Plot = { width: 120, height: 147, pad: 10 }
const note = (
  voice: 0 | 1 | 2 | 3,
  dot: number,
  start: number,
  velocity = 64,
): StepNote => ({ voice, dot, start, end: start + 0.1, note: 60, velocity })

describe("velocity bars", () => {
  const notes = [note(0, 0, 0), note(1, 0, 0.25, 90), note(0, 1, 0.5, 40)]

  it("stand at the start of each note of the voices asked for", () => {
    expect(barsFor(notes, [0], plot)).toEqual([
      { voice: 0, dot: 0, velocity: 64, x: 10 },
      { voice: 0, dot: 1, velocity: 40, x: 60 },
    ])
    expect(barsFor(notes, [0, 1], plot)).toHaveLength(3)
  })

  it("are caught anywhere in their column, with a little room", () => {
    const bars = barsFor(notes, [0, 1], plot)
    expect(barsAt(bars, 60 + BAR_WIDTH / 2)).toEqual([bars[2]])
    expect(barsAt(bars, 58)).toEqual([bars[2]])
    expect(barsAt(bars, 45)).toEqual([])
  })

  it("take a stroke's value where it crosses them, in either direction", () => {
    const bars = barsFor(notes, [0, 1], plot)
    // from the first bar's middle at 0 to past the last at 100
    const crossed = barsAlong(
      bars,
      { x: 12.5, value: 0 },
      { x: 112.5, value: 100 },
    )
    expect(crossed.map(({ value }) => value)).toEqual([0, 25, 50])

    // right to left over the middle two: 10 at 70 rising to 30 at 30
    const back = barsAlong(bars, { x: 70, value: 10 }, { x: 30, value: 30 })
    expect(back).toEqual([
      { bar: bars[1], value: 26.25 },
      { bar: bars[2], value: 13.75 },
    ])
  })

  it("belong to their dot, so one dot's bars move together", () => {
    expect(dotKey(note(2, 5, 0))).toBe(dotKey(note(2, 5, 0.75)))
    expect(dotKey(note(2, 5, 0))).not.toBe(dotKey(note(3, 5, 0)))
  })
})
