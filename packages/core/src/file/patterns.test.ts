import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import { createFile, FILE_EXTENSION, serializeFile } from "./file"
import {
  createPatternsFile,
  PATTERNS_EXTENSION,
  PATTERNS_FORMAT,
  parsePatternsFile,
  serializePatterns,
  setPatterns,
} from "./patterns"

const patterned = () => {
  const patch = createDemoPatch()
  patch.voices[2].patternLength = 7
  patch.voices[2].pattern[4] = {
    on: false,
    articulation: "tie",
    accent: "-",
    ratchet: 3,
    probability: 33,
    condition: "last",
  }
  return patch
}

// Chrome refuses any other extension outright, and a picker that throws
// looks, to someone clicking, like a button that does nothing.
const pickerAccepts = (extension: string) =>
  extension.length <= 16 && /^\.[a-z0-9+]+(\.[a-z0-9+]+)*$/i.test(extension)

describe("pattern files", () => {
  it("use extensions the browser's file pickers accept", () => {
    expect(pickerAccepts(PATTERNS_EXTENSION)).toBe(true)
    expect(pickerAccepts(FILE_EXTENSION)).toBe(true)
    // what the first version shipped with, which Chrome rejected
    expect(pickerAccepts(".midiseq-patterns.json")).toBe(false)
  })

  it("round-trips every voice's settings and dots", () => {
    const patch = patterned()
    const result = parsePatternsFile(
      serializePatterns(createPatternsFile(patch)),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.voices).toEqual(patch.voices)
    }
  })

  it("holds the voices whole and nothing of the sequencer", () => {
    const file = createPatternsFile(patterned())
    expect(file.format).toBe(PATTERNS_FORMAT)
    expect(Object.keys(file.voices[0]).sort()).toEqual([
      "channel",
      "enabled",
      "length",
      "offset",
      "pace",
      "pattern",
      "patternLength",
      "program",
      "rule",
      "velocity",
    ])
    expect(file).not.toHaveProperty("patch")
    expect(file).not.toHaveProperty("steps")
  })

  it("replaces every voice and leaves the sequencer and its steps be", () => {
    const source = patterned()
    source.voices[2].rule = "fall"
    source.voices[2].pace = "16thT"
    source.voices[2].length = 0.3
    source.voices[1].program = 33
    const target = createDefaultPatch()
    target.tempo = 88
    target.pace = "2nd"

    const result = parsePatternsFile(
      serializePatterns(createPatternsFile(source)),
    )
    if (!result.ok) {
      throw new Error(result.error)
    }
    const next = setPatterns(target, result.voices)

    expect(next.voices).toEqual(source.voices)
    expect(next.tempo).toBe(88)
    expect(next.pace).toBe("2nd")
    expect(next.steps).toBe(target.steps)
    // and the target itself is untouched, so the change can be undone
    expect(target.voices[2].rule).toBe("nth")
  })

  it("opens a file of dots alone, and changes only the dots", () => {
    const source = patterned()
    const older = {
      format: PATTERNS_FORMAT,
      version: 1,
      voices: source.voices.map(({ patternLength, pattern }) => ({
        patternLength,
        pattern,
      })),
    }
    const target = createDefaultPatch()
    target.voices[2].rule = "rise"

    const result = parsePatternsFile(JSON.stringify(older))
    if (!result.ok) {
      throw new Error(result.error)
    }
    const next = setPatterns(target, result.voices)

    expect(next.voices[2].pattern).toEqual(source.voices[2].pattern)
    expect(next.voices[2].patternLength).toBe(7)
    expect(next.voices[2].rule).toBe("rise")
    expect(next.voices[2].pace).toBe(target.voices[2].pace)
  })

  it("refuses a voice setting out of range, and says where", () => {
    const file = JSON.parse(
      serializePatterns(createPatternsFile(createDefaultPatch())),
    )
    file.voices[1].velocity = 500
    const result = parsePatternsFile(JSON.stringify(file))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/^voices\.1\.velocity/)
    }
  })

  it("refuses a patch file, so the two can't be mixed up", () => {
    const patchFile = serializeFile(createFile(createDefaultPatch()))
    expect(parsePatternsFile(patchFile)).toMatchObject({ ok: false })
  })

  it("refuses files that aren't patterns, and says why", () => {
    expect(parsePatternsFile("not json")).toEqual({
      ok: false,
      error: "That file isn't JSON.",
    })

    const three = JSON.parse(
      serializePatterns(createPatternsFile(createDefaultPatch())),
    )
    three.voices.pop()
    const result = parsePatternsFile(JSON.stringify(three))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/^voices/)
    }
  })

  it("refuses patterns from a newer version", () => {
    const newer = {
      ...createPatternsFile(createDefaultPatch()),
      version: 2,
    }
    const result = parsePatternsFile(JSON.stringify(newer))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/newer version/)
    }
  })
})
