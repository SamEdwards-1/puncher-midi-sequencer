import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "./defaults"
import { defaultModulation } from "./modulation"
import { SequencerSetting } from "./types"
import { PatchSchema } from "./schema"

describe("PatchSchema", () => {
  it("preserves all sequencer modulation settings through JSON", () => {
    const patch = createDefaultPatch()
    const settings: SequencerSetting[] = [
      "size",
      "direction",
      "loop",
      "shiftAmt",
      "shiftFit",
      "maxNotesPerStep",
    ]
    patch.modulations = settings.map((setting, index) =>
      defaultModulation(patch, { kind: "sequencer", setting }, 20 + index),
    )
    expect(
      PatchSchema.parse(JSON.parse(JSON.stringify(patch))).modulations,
    ).toEqual(patch.modulations)
  })
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

  describe("modulations", () => {
    const read = (modulations: unknown[]) => {
      const parsed = PatchSchema.safeParse({
        ...createDefaultPatch(),
        modulations,
      })
      expect(parsed.success).toBe(true)
      return parsed.data?.modulations
    }

    it("reads a patch from before them as having none", () => {
      const { modulations: _, ...older } = createDefaultPatch()
      expect(PatchSchema.parse(older).modulations).toEqual([])
    })

    it("reads an end the setting hasn't as its nearest value, or its first or last", () => {
      expect(
        read([
          {
            target: { kind: "voice", voice: 1, setting: "length" },
            cc: 3,
            from: 0.52,
            to: "long",
          },
          {
            target: { kind: "sequencer", setting: "scale" },
            cc: 9,
            from: { tonic: 2, name: "hirajoshi" },
            to: { tonic: 11, name: "phrygian" },
          },
        ]),
      ).toEqual([
        {
          target: { kind: "voice", voice: 1, setting: "length" },
          cc: 3,
          from: 0.5,
          to: 1,
        },
        {
          target: { kind: "sequencer", setting: "scale" },
          cc: 9,
          from: null,
          to: { tonic: 11, name: "phrygian" },
        },
      ])
    })

    it("keeps the first of two for one setting", () => {
      const pace = { kind: "voice", voice: 0, setting: "pace" }
      expect(
        read([
          { target: pace, cc: 3, from: "4th", to: "8th" },
          { target: pace, cc: 9, from: "1bar", to: "16th" },
        ]),
      ).toEqual([{ target: pace, cc: 3, from: "4th", to: "8th" }])
    })

    it("rejects a setting that can't be modulated", () => {
      const parsed = PatchSchema.safeParse({
        ...createDefaultPatch(),
        modulations: [
          {
            target: { kind: "voice", voice: 0, setting: "velocity" },
            cc: 3,
            from: 1,
            to: 127,
          },
        ],
      })
      expect(parsed.success).toBe(false)
    })
  })
})
