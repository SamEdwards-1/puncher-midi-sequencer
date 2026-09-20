import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { Engine } from "./Engine"

describe("tie into the same note", () => {
  it("extends the sounding note instead of retriggering it", () => {
    const patch = createDefaultPatch()
    patch.pace = "1bar"
    patch.steps[0].notes = [60]
    patch.voices[0] = {
      ...patch.voices[0],
      enabled: true,
      pace: "4th",
      length: 1,
      patternLength: 2,
      pattern: patch.voices[0].pattern.map((dot, index) => ({
        ...dot,
        articulation: index === 1 ? "tie" : "none",
      })),
    }

    const engine = new Engine(patch)
    engine.start(0)
    const firstTwoBeats = engine.render(1.9)
    expect(firstTwoBeats.filter((e) => e.type === "noteOn")).toHaveLength(1)
    expect(firstTwoBeats.filter((e) => e.type === "noteOff")).toHaveLength(0)

    // the tied note ends at the end of the tie dot, then dot 0 plays again
    const next = engine.render(2.1).filter((e) => e.type !== "step")
    expect(next).toEqual([
      { type: "noteOff", beat: 2, voice: 0, note: 60, channel: 1 },
      { type: "noteOn", beat: 2, voice: 0, note: 60, velocity: 64, channel: 1 },
    ])
  })
})
