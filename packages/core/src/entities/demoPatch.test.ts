import { describe, expect, it } from "vitest"
import { Engine } from "../engine/Engine"
import { createDemoPatch } from "./demoPatch"
import { PatchSchema } from "./schema"

describe("createDemoPatch", () => {
  it("is a valid patch", () => {
    expect(PatchSchema.safeParse(createDemoPatch()).success).toBe(true)
  })

  it("plays notes on three channels", () => {
    const engine = new Engine(createDemoPatch(), { seed: 3 })
    engine.start(0)
    const channels = new Set(
      engine
        .render(16)
        .filter((event) => event.type === "noteOn")
        .map((event) => event.channel),
    )
    expect([...channels].sort()).toEqual([1, 2, 3])
  })
})
