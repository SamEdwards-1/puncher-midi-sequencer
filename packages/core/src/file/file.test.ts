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

  it("reads the note count a file was saved with, within today's range", () => {
    const patch = createDemoPatch()
    const text = serializeFile(createFile(patch))
    const saved = (maxNotesPerStep: unknown) => {
      const file = JSON.parse(text)
      if (maxNotesPerStep === undefined) {
        delete file.patch.maxNotesPerStep
      } else {
        file.patch.maxNotesPerStep = maxNotesPerStep
      }
      const result = parseFile(JSON.stringify(file))
      return result.ok
        ? result.patch.maxNotesPerStep
        : `refused: ${result.error}`
    }

    expect(saved(2)).toBe(2)
    // more than a note per voice, from when the limit went to sixteen
    expect(saved(16)).toBe(4)
    // and from when it was fixed at four and not written at all
    expect(saved(undefined)).toBe(4)
  })

  it("opens a file whose CCs followed a voice's channel", () => {
    const patch = createDemoPatch()
    const text = serializeFile(createFile(patch))
    const older = JSON.parse(text)
    // as that version wrote a CC: a voice's own channel, and a target output
    older.patch.steps[0].ccs = [
      { id: 1, cc: 74, value: 100, channel: "voice", output: 2 },
    ]
    const result = parseFile(JSON.stringify(older))

    expect(result.ok).toBe(true)
    if (result.ok) {
      // it lands on channel 1, and the output it targeted is forgotten
      expect(result.patch.steps[0].ccs).toEqual([
        { id: 1, cc: 74, value: 100, channel: 1 },
      ])
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
