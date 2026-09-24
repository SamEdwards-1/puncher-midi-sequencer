import { describe, expect, it } from "vitest"
import { setStepNotes } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import { PatchJSON } from "../entities/types"
import { createFile, parseFile, serializeFile } from "./file"

// Every sequencer and voice setting moved off its default, each voice
// differently, with every dot option in use somewhere.
const everySettingChanged = (): PatchJSON => {
  const patch = createDefaultPatch()
  const pick = <T>(options: readonly T[], index: number) =>
    options[index % options.length]
  return {
    ...patch,
    name: "Everything",
    size: "small",
    loop: { mode: "custom", end: 11 },
    maxNotesPerStep: 3,
    syncVoices: !patch.syncVoices,
    pace: "16thT",
    direction: "random+",
    shiftAmt: -7,
    tempo: 93.5,
    steps: patch.steps.map((step, index) =>
      index === 5
        ? {
            notes: [48, 52],
            envelopes: [
              {
                id: 1,
                cc: 74,
                channel: 9,
                points: [
                  { time: 0, value: 90 },
                  { time: 0.25, value: 12 },
                  { time: 0.25, value: 127 },
                  { time: 1 / 3, value: 64 },
                ],
              },
            ],
            state: "rest",
            jump: { rule: { kind: "every", n: 3 }, dest: 2, normal: 7 },
          }
        : step,
    ),
    voices: patch.voices.map((voice, index) => ({
      enabled: !voice.enabled,
      pace: pick(["32ndT", "2ndD", "8thD", "16bar"] as const, index),
      length: 0.35,
      rule: pick(["fall", "updown+", "random", "highest"] as const, index),
      offset: index * 5 - 12,
      patternLength: 3 + index * 4,
      pattern: voice.pattern.map((_, dot) => ({
        on: (dot + index) % 3 !== 0,
        articulation: pick(["hold", "tie", "none"] as const, dot + index),
        accent: pick(["+", "-", "none"] as const, dot + index),
        velocityOffset: pick([0, 7, -12, 30] as const, dot + index),
        ratchet: pick([2, 3, 4, 1] as const, dot + index),
        probability: pick([50, 25, 90, 100] as const, dot + index),
        condition: pick(["2:2", "1x", "notLast", "always"] as const, dot),
      })),
      velocity: 20 + index,
      channel: 16 - index,
      program: 40 + index,
    })),
  }
}

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

  it("keeps every sequencer setting, voice setting and dot", () => {
    const patch = everySettingChanged()
    const result = parseFile(serializeFile(createFile(patch)))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch).toEqual(patch)
    }
  })

  it("tests every setting there is, so a new one can't slip past", () => {
    // a setting added later fails here until it is varied above, and so
    // proven to survive a save
    const before = createDefaultPatch()
    const after = everySettingChanged()
    const differs = (a: unknown, b: unknown) =>
      JSON.stringify(a) !== JSON.stringify(b)

    const sequencer = Object.keys(before).filter(
      (key) => !["version", "modOuts"].includes(key),
    ) as (keyof PatchJSON)[]
    for (const key of sequencer) {
      expect(differs(before[key], after[key]), key).toBe(true)
    }
    for (const [index, voice] of before.voices.entries()) {
      for (const key of Object.keys(voice) as (keyof typeof voice)[]) {
        expect(differs(voice[key], after.voices[index][key]), key).toBe(true)
      }
    }
    const dots = after.voices.flatMap((voice) => voice.pattern)
    const defaultDot = before.voices[0].pattern[0]
    for (const key of Object.keys(defaultDot) as (keyof typeof defaultDot)[]) {
      const values = new Set(dots.map((dot) => dot[key]))
      expect(values.size, `dot ${key}`).toBeGreaterThan(1)
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

  it("opens a file of CC events as one-point envelopes", () => {
    const patch = createDemoPatch()
    const text = serializeFile(createFile(patch))
    const older = JSON.parse(text)
    for (const step of older.patch.steps) {
      delete step.envelopes
      step.ccs = []
    }
    older.patch.steps[0].ccs = [
      { id: 1, cc: 74, value: 100, channel: 3 },
      // written when a CC could follow a voice's channel
      { id: 2, cc: 71, value: 5, channel: "voice", output: 2 },
    ]
    const result = parseFile(JSON.stringify(older))

    expect(result.ok).toBe(true)
    if (result.ok) {
      // a point at the step's start sends just what the CC event did
      expect(result.patch.steps[0].envelopes).toEqual([
        { id: 1, cc: 74, channel: 3, points: [{ time: 0, value: 100 }] },
        { id: 2, cc: 71, channel: 1, points: [{ time: 0, value: 5 }] },
      ])
      expect(result.patch.steps[1].envelopes).toEqual([])
      expect(result.patch.steps[0]).not.toHaveProperty("ccs")
    }
  })

  it("puts an envelope's points in time order, keeping jumps as they were", () => {
    const file = JSON.parse(serializeFile(createFile(createDefaultPatch())))
    file.patch.steps[0].envelopes = [
      {
        id: 1,
        cc: 1,
        channel: 1,
        points: [
          { time: 0.5, value: 1 },
          { time: 0.25, value: 2 },
          { time: 0.5, value: 3 },
        ],
      },
    ]
    const result = parseFile(JSON.stringify(file))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch.steps[0].envelopes[0].points).toEqual([
        { time: 0.25, value: 2 },
        { time: 0.5, value: 1 },
        { time: 0.5, value: 3 },
      ])
    }
  })

  it("refuses an envelope point outside its step", () => {
    const file = JSON.parse(serializeFile(createFile(createDefaultPatch())))
    file.patch.steps[3].envelopes = [
      { id: 1, cc: 1, channel: 1, points: [{ time: 1.5, value: 1 }] },
    ]
    const result = parseFile(JSON.stringify(file))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(
        /^patch\.steps\.3\.envelopes\.0\.points\.0\.time/,
      )
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
