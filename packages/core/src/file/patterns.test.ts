import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import { createFile, serializeFile } from "./file"
import {
  createPatternsFile,
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

describe("pattern files", () => {
  it("round-trips every voice's dots and pattern length", () => {
    const patch = patterned()
    const result = parsePatternsFile(
      serializePatterns(createPatternsFile(patch)),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.voices).toEqual(
        patch.voices.map(({ patternLength, pattern }) => ({
          patternLength,
          pattern,
        })),
      )
    }
  })

  it("holds the patterns and nothing else of the patch", () => {
    const file = createPatternsFile(patterned())
    expect(file.format).toBe(PATTERNS_FORMAT)
    expect(Object.keys(file.voices[0]).sort()).toEqual([
      "pattern",
      "patternLength",
    ])
    expect(file).not.toHaveProperty("patch")
  })

  it("puts patterns in place and leaves the rest of each voice be", () => {
    const source = patterned()
    const target = createDefaultPatch()
    target.voices[2].rule = "fall"
    target.tempo = 88

    const result = parsePatternsFile(
      serializePatterns(createPatternsFile(source)),
    )
    if (!result.ok) {
      throw new Error(result.error)
    }
    const next = setPatterns(target, result.voices)

    expect(next.voices[2].pattern).toEqual(source.voices[2].pattern)
    expect(next.voices[2].patternLength).toBe(7)
    // the voice's settings and the sequencer are the target's
    expect(next.voices[2].rule).toBe("fall")
    expect(next.voices[2].pace).toBe(target.voices[2].pace)
    expect(next.tempo).toBe(88)
    expect(next.steps).toBe(target.steps)
    // and the target itself is untouched, so the change can be undone
    expect(target.voices[2].patternLength).toBe(16)
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
