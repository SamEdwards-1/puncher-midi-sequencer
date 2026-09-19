import { describe, expect, it } from "vitest"
import {
  GOLDEN_RATIO,
  PACE_BEATS,
  PACE_LABELS,
  paceBeats,
  SEQUENCER_PACES,
  VOICE_PACES,
} from "./paces"

describe("paces", () => {
  it("measures durations in quarter-note beats", () => {
    expect(paceBeats("4th")).toBe(1)
    expect(paceBeats("1bar")).toBe(4)
    expect(paceBeats("16bar")).toBe(64)
    expect(paceBeats("8thD")).toBe(0.75)
    expect(paceBeats("4thT")).toBeCloseTo(2 / 3)
  })

  it("makes golden paces about 1.618x their straight note", () => {
    expect(paceBeats("g4th") / paceBeats("4th")).toBeCloseTo(GOLDEN_RATIO)
    expect(paceBeats("g8th") / paceBeats("8th")).toBeCloseTo(GOLDEN_RATIO)
    // slower than the straight note but faster than the dotted one
    expect(paceBeats("g8th")).toBeGreaterThan(paceBeats("8thD"))
    expect(paceBeats("g8th")).toBeLessThan(paceBeats("4th"))
  })

  it("lists voice paces slowest first and leaves golden out of the sequencer", () => {
    const durations = VOICE_PACES.map(paceBeats)
    expect(durations).toEqual([...durations].sort((a, b) => b - a))
    expect(VOICE_PACES).toHaveLength(26)
    expect(SEQUENCER_PACES).toHaveLength(20)
    expect(SEQUENCER_PACES.some((id) => id.startsWith("g"))).toBe(false)
  })

  it("labels every pace", () => {
    for (const id of Object.keys(PACE_BEATS)) {
      expect(PACE_LABELS[id as keyof typeof PACE_BEATS]).toBeTruthy()
    }
  })
})
