import { describe, expect, it } from "vitest"
import { setStepNotes } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import { createFile, parseFile, serializeFile } from "./file"

describe("the file format", () => {
  it("round-trips a patch exactly", () => {
    const patch = setStepNotes(createDemoPatch(), 9, [60, 64, 67])
    const text = serializeFile(createFile(patch, { selectedStep: 9 }))
    const result = parseFile(text)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch).toEqual(patch)
      expect(result.file.ui?.selectedStep).toBe(9)
    }
  })

  it("writes pretty JSON ending in a newline", () => {
    const text = serializeFile(createFile(createDefaultPatch()))
    expect(text.startsWith("{\n")).toBe(true)
    expect(text.endsWith("\n")).toBe(true)
  })

  it("refuses files that aren't ours", () => {
    expect(parseFile("not json")).toMatchObject({ ok: false })
    expect(parseFile('{"format":"other","version":1}')).toMatchObject({
      ok: false,
    })

    const wrongPatch = parseFile(
      JSON.stringify({ format: "midiseq", version: 1, patch: { tempo: 120 } }),
    )
    expect(wrongPatch.ok).toBe(false)
  })

  it("refuses a file from a newer version", () => {
    const text = serializeFile({
      ...createFile(createDefaultPatch()),
      version: 99,
    })
    const result = parseFile(text)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/newer version/)
    }
  })

  it("says where a bad file went wrong", () => {
    const file = createFile(createDefaultPatch())
    const broken = JSON.parse(serializeFile(file))
    broken.patch.tempo = 5000
    const result = parseFile(JSON.stringify(broken))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/patch.tempo/)
    }
  })
})
