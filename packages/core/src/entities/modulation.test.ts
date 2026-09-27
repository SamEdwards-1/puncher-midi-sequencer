import { describe, expect, it } from "vitest"
import { addEnvelope } from "../commands/patchCommands"
import { UNDEFINED_CCS } from "../midi/ccNames"
import { createDefaultPatch } from "./defaults"
import {
  defaultModulation,
  inModulationRange,
  modulatedSequencer,
  modulatedVoice,
  modulationCC,
  modulationChoices,
  modulationRange,
  modulationStops,
  modulationValueAt,
  nextModulationCC,
  SEQUENCER_SCALES,
  snapToModulation,
  stepPace,
} from "./modulation"
import { ModulationJSON, ModulationTarget, PatchJSON } from "./types"

const VOICE_PACE: ModulationTarget = {
  kind: "voice",
  voice: 0,
  setting: "pace",
}

// seven paces, 4th to 16th with the dotted and triplet ones between
const paces: ModulationJSON = {
  target: VOICE_PACE,
  cc: 3,
  from: "4th",
  to: "16th",
}

const withModulation = (
  patch: PatchJSON,
  modulation: ModulationJSON,
  values: [step: number, value: number][] = [],
): PatchJSON =>
  values.reduce(
    (next, [step, value]) =>
      addEnvelope(next, step, {
        cc: modulation.cc,
        channel: 1,
        points: [{ time: 0, value }],
      }),
    { ...patch, modulations: [...patch.modulations, modulation] },
  )

describe("a modulation", () => {
  it("runs through the setting's values from its first to its last", () => {
    expect(modulationRange(paces)).toEqual([
      "4th",
      "8thD",
      "4thT",
      "8th",
      "16thD",
      "8thT",
      "16th",
    ])
  })

  it("spreads them evenly across the CC, the first at 0 and the last at 127", () => {
    expect(modulationStops(paces).map(({ cc }) => cc)).toEqual([
      0, 21, 42, 64, 85, 106, 127,
    ])
    expect(modulationValueAt(paces, 0)).toBe("4th")
    expect(modulationValueAt(paces, 64)).toBe("8th")
    expect(modulationValueAt(paces, 127)).toBe("16th")
  })

  it("takes a CC value between two values to the nearer", () => {
    expect(modulationValueAt(paces, 10)).toBe("4th")
    expect(modulationValueAt(paces, 11)).toBe("8thD")
  })

  it("runs backwards when it starts from the later value", () => {
    const offsets: ModulationJSON = {
      target: { kind: "voice", voice: 1, setting: "offset" },
      cc: 3,
      from: 12,
      to: -12,
    }
    expect(modulationValueAt(offsets, 0)).toBe(12)
    expect(modulationValueAt(offsets, 127)).toBe(-12)
    expect(modulationValueAt(offsets, 64)).toBe(0)
  })

  it("snaps a CC value to the nearest that stands for a value", () => {
    expect(snapToModulation(paces, 30)).toBe(21)
    expect(snapToModulation(paces, 33)).toBe(42)
    expect(snapToModulation(paces, 127)).toBe(127)
  })

  it("gives the CC value for a setting, or the nearer end for one it doesn't reach", () => {
    expect(modulationCC(paces, "8th")).toBe(64)
    // slower than the range starts, and faster than it ends
    expect(modulationCC(paces, "1bar")).toBe(0)
    expect(modulationCC(paces, "32nd")).toBe(127)
    expect(inModulationRange(paces, "8th")).toBe(true)
    expect(inModulationRange(paces, "1bar")).toBe(false)
  })

  it("reaches every value of every setting, each at a CC value of its own", () => {
    const targets: ModulationTarget[] = [
      "pace",
      "length",
      "rule",
      "offset",
      "offsetFit",
      "patternLength",
    ]
      .map(
        (setting) => ({ kind: "voice", voice: 0, setting }) as ModulationTarget,
      )
      .concat(
        ["pace", "scale", "shiftFit"].map(
          (setting) => ({ kind: "sequencer", setting }) as ModulationTarget,
        ),
      )
    for (const target of targets) {
      const choices = modulationChoices(target)
      const all = {
        target,
        cc: 3,
        from: choices[0],
        to: choices[choices.length - 1],
      }
      const stops = modulationStops(all)
      expect(stops.length, target.setting).toBe(choices.length)
      expect(new Set(stops.map(({ cc }) => cc)).size, target.setting).toBe(
        choices.length,
      )
      for (const { value, cc } of stops) {
        expect(modulationValueAt(all, cc)).toEqual(value)
      }
    }
  })

  it("moves through ten scales at each tonic, and none", () => {
    const scales = modulationChoices({ kind: "sequencer", setting: "scale" })
    expect(SEQUENCER_SCALES).toHaveLength(10)
    expect(scales).toHaveLength(121)
    expect(scales[0]).toBeNull()
    expect(scales[1]).toEqual({ tonic: 0, name: "major" })
    expect(scales[11]).toEqual({ tonic: 1, name: "major" })
  })

  it("starts across all of a setting's values, or a scale's ten at its tonic", () => {
    const patch = createDefaultPatch()
    // with no scale, none and C's ten, which lie together
    const none = defaultModulation(
      patch,
      { kind: "sequencer", setting: "scale" },
      9,
    )
    expect(none.from).toBeNull()
    expect(none.to).toEqual({ tonic: 0, name: "minorBlues" })
    expect(modulationRange(none)).toHaveLength(11)
    expect(defaultModulation(patch, VOICE_PACE, 3)).toEqual({
      target: VOICE_PACE,
      cc: 3,
      from: "16bar",
      to: "32ndT",
    })
    patch.scale = {
      tonic: 2,
      name: "dorian",
      steps: [0, 2, 3, 5, 7, 9, 10],
      fit: "up",
    }
    const scale = defaultModulation(
      patch,
      { kind: "sequencer", setting: "scale" },
      9,
    )
    expect(scale.from).toEqual({ tonic: 2, name: "major" })
    expect(scale.to).toEqual({ tonic: 2, name: "minorBlues" })
  })
})

describe("the CC a new modulation is offered", () => {
  it("is the first undefined controller", () => {
    expect(nextModulationCC(createDefaultPatch())).toBe(3)
    expect(UNDEFINED_CCS.slice(0, 5)).toEqual([3, 9, 14, 15, 20])
  })

  it("skips those a modulation, an envelope or a mod output that is on uses", () => {
    let patch = withModulation(createDefaultPatch(), paces)
    patch = addEnvelope(patch, 4, {
      cc: 9,
      channel: 2,
      points: [{ time: 0, value: 1 }],
    })
    expect(nextModulationCC(patch)).toBe(14)
    patch.modOuts[0] = { ...patch.modOuts[0], enabled: true, cc: 14 }
    expect(nextModulationCC(patch)).toBe(15)
  })
})

describe("modulated settings", () => {
  it("follow the CC's envelope on a step that has one, and are their own elsewhere", () => {
    const patch = withModulation(createDefaultPatch(), paces, [[2, 127]])
    expect(modulatedVoice(patch, 0, 2, 0).pace).toBe("16th")
    expect(modulatedVoice(patch, 0, 3, 0).pace).toBe("8th")
    // another voice's pace is its own
    expect(modulatedVoice(patch, 1, 2, 0).pace).toBe("8th")
  })

  it("read the envelope at the time asked for", () => {
    let patch = withModulation(createDefaultPatch(), paces)
    patch = addEnvelope(patch, 0, {
      cc: 3,
      channel: 1,
      shape: "steps",
      points: [
        { time: 0, value: 0 },
        { time: 1, value: 127 },
      ],
    })
    expect(modulatedVoice(patch, 0, 0, 0.5).pace).toBe("4th")
    expect(modulatedVoice(patch, 0, 0, 1).pace).toBe("16th")
  })

  it("move the sequencer to a scale, with its steps", () => {
    const patch = withModulation(
      createDefaultPatch(),
      {
        target: { kind: "sequencer", setting: "scale" },
        cc: 3,
        from: null,
        to: { tonic: 0, name: "minor" },
      },
      [
        [0, 127],
        [1, 0],
      ],
    )
    expect(modulatedSequencer(patch, 0, 0).scale).toEqual({
      tonic: 0,
      name: "minor",
      steps: [0, 2, 3, 5, 7, 8, 10],
      fit: "up",
    })
    expect(modulatedSequencer(patch, 1, 0).scale).toBeNull()
  })

  it("make a step last as long as the sequencer's pace as it lands", () => {
    const patch = withModulation(
      createDefaultPatch(),
      {
        target: { kind: "sequencer", setting: "pace" },
        cc: 3,
        from: "1bar",
        to: "4th",
      },
      [[4, 0]],
    )
    expect(stepPace(patch, 4)).toBe("1bar")
    expect(stepPace(patch, 5)).toBe("8th")
  })
})
