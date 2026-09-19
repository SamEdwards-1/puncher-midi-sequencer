import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "./defaults"
import { PatchSchema } from "./schema"

describe("PatchSchema", () => {
  it("accepts the default patch", () => {
    expect(PatchSchema.safeParse(createDefaultPatch()).success).toBe(true)
  })

  it("rejects out-of-range values", () => {
    const patch = createDefaultPatch()
    patch.voices[0].channel = 17
    expect(PatchSchema.safeParse(patch).success).toBe(false)

    const withBadNote = createDefaultPatch()
    withBadNote.steps[0].notes = [128]
    expect(PatchSchema.safeParse(withBadNote).success).toBe(false)

    const withBadPace = createDefaultPatch()
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    ;(withBadPace as any).pace = "64th"
    expect(PatchSchema.safeParse(withBadPace).success).toBe(false)
  })

  it("rejects a patch with the wrong number of steps or voices", () => {
    const short = createDefaultPatch()
    short.steps = short.steps.slice(0, 16)
    expect(PatchSchema.safeParse(short).success).toBe(false)

    const fewVoices = createDefaultPatch()
    fewVoices.voices = fewVoices.voices.slice(0, 3)
    expect(PatchSchema.safeParse(fewVoices).success).toBe(false)
  })
})
