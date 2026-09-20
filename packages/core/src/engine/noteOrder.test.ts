import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { Engine } from "./Engine"

describe("note order", () => {
  it("reads a step's notes lowest first, whatever order they are stored in", () => {
    const patch = createDefaultPatch()
    patch.pace = "1bar"
    // stored in the order they were entered, not sorted
    patch.steps[0].notes = [67, 60, 64]
    patch.voices[0] = {
      ...patch.voices[0],
      enabled: true,
      pace: "4th",
      rule: "up",
    }

    const engine = new Engine(patch)
    engine.start(0)
    const played = engine
      .render(2.9)
      .filter((event) => event.type === "noteOn")
      .map((event) => event.note)

    expect(played).toEqual([60, 64, 67])
  })

  it("takes the lowest notes when a step holds more than the limit", () => {
    const patch = createDefaultPatch()
    patch.pace = "1bar"
    patch.maxNotesPerStep = 2
    patch.steps[0].notes = [72, 48, 64, 55]
    patch.voices[0] = {
      ...patch.voices[0],
      enabled: true,
      pace: "4th",
      rule: "up",
    }

    const engine = new Engine(patch)
    engine.start(0)
    const played = engine
      .render(1.9)
      .filter((event) => event.type === "noteOn")
      .map((event) => event.note)

    expect(played).toEqual([48, 55])
  })
})
