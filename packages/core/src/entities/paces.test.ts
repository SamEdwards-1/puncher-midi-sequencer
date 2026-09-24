import { describe, expect, it } from "vitest"
import {
  dotsPerStep,
  migratePace,
  nearestPace,
  PACE_BEATS,
  PACE_LABELS,
  PACES,
  paceBeats,
} from "./paces"

describe("paces", () => {
  it("measures durations in quarter-note beats", () => {
    expect(paceBeats("4th")).toBe(1)
    expect(paceBeats("1bar")).toBe(4)
    expect(paceBeats("16bar")).toBe(64)
    expect(paceBeats("8thD")).toBe(0.75)
    expect(paceBeats("4thT")).toBeCloseTo(2 / 3)
  })

  it("offers straight, dotted and triplet notes, slowest first", () => {
    const durations = PACES.map(paceBeats)
    expect(durations).toEqual([...durations].sort((a, b) => b - a))
    expect(PACES).toHaveLength(20)
    expect(PACES.some((id) => id.startsWith("g"))).toBe(false)
  })

  it("labels every pace", () => {
    for (const id of Object.keys(PACE_BEATS)) {
      expect(PACE_LABELS[id as keyof typeof PACE_BEATS]).toBeTruthy()
    }
  })

  it("reads a golden pace from an older file as the nearest one left", () => {
    // 1.618 beats, between the quarter and the dotted quarter
    expect(migratePace("g4th")).toBe("4thD")
    // 6.47 beats, nearest the two-bar pace at 8
    expect(migratePace("gWhole")).toBe("2bar")
    expect(migratePace("g32nd")).toBe("32ndD")
    // anything else is left alone, for the schema to accept or refuse
    expect(migratePace("8th")).toBe("8th")
    expect(migratePace("nonsense")).toBe("nonsense")
  })

  it("finds the pace nearest a length", () => {
    expect(nearestPace(1)).toBe("4th")
    expect(nearestPace(0.26)).toBe("16th")
    expect(nearestPace(1000)).toBe("16bar")
  })

  describe("dots per step", () => {
    it("plays one dot every voice pace for the length of a step", () => {
      // a bar of 8ths
      expect(dotsPerStep("1bar", "8th", 16)).toBe(8)
      expect(dotsPerStep("4th", "16th", 16)).toBe(4)
      expect(dotsPerStep("4th", "4th", 16)).toBe(1)
    })

    it("counts a dot that starts before the step ends, though it runs past", () => {
      // dots at beats 0 and 0.75 of a one-beat step
      expect(dotsPerStep("4th", "8thD", 16)).toBe(2)
      // a voice slower than the sequencer still plays its first dot
      expect(dotsPerStep("16th", "1bar", 16)).toBe(1)
    })

    it("does not let triplet arithmetic add a dot", () => {
      // 1 / (1/3) is 3.0000000000000004 in floating point
      expect(dotsPerStep("4th", "8thT", 16)).toBe(3)
      expect(dotsPerStep("2ndT", "4thT", 16)).toBe(2)
    })

    it("never counts more dots than the pattern holds", () => {
      expect(dotsPerStep("1bar", "16th", 16)).toBe(16)
      expect(dotsPerStep("1bar", "16th", 5)).toBe(5)
      expect(dotsPerStep("16bar", "32ndT", 16)).toBe(16)
    })
  })
})
