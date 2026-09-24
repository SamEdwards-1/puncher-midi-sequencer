import { describe, expect, it } from "vitest"
import {
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
})
