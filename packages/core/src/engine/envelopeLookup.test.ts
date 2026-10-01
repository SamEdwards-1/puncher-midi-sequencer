import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { valueAt } from "../entities/envelope"
import { envelopeLookup, modulationLookup } from "../entities/lookup"
import {
  modulatedAction,
  modulatedSequencer,
  modulatedVoice,
  modulationForCC,
  modulationOf,
} from "../entities/modulation"
import {
  EnvelopeJSON,
  EnvelopePointJSON,
  EnvelopeShape,
  ModulationJSON,
  PatchJSON,
} from "../entities/types"
import { Engine, renderThrough } from "./Engine"
import { EngineEvent } from "./events"

// The original sampler is an independent reference for interpolation and
// duplicate-time ordering, including before/after the stored point range.
const linearValueAt = (
  points: EnvelopePointJSON[],
  time: number,
  shape: EnvelopeShape,
): number | null => {
  if (points.length === 0) {
    return null
  }
  if (time < points[0].time) {
    return points[0].value
  }
  for (let index = points.length - 1; index >= 0; index--) {
    const point = points[index]
    if (point.time <= time) {
      const next = points[index + 1]
      if (shape === "steps" || next === undefined || next.time === point.time) {
        return point.value
      }
      const along = (time - point.time) / (next.time - point.time)
      return point.value + (next.value - point.value) * along
    }
  }
  return points[0].value
}

const lane = (points: EnvelopePointJSON[], channel = 1): EnvelopeJSON => ({
  id: channel,
  cc: 74,
  channel,
  points,
})

const withEnvelopes = (
  patch: PatchJSON,
  envelopes: EnvelopeJSON[],
): PatchJSON => ({
  ...patch,
  steps: patch.steps.map((step, index) =>
    index === 0 ? { ...step, envelopes } : step,
  ),
})

const heldPatch = (): PatchJSON => {
  const patch = createDefaultPatch()
  patch.pace = "1bar"
  patch.loop = { mode: "custom", end: 0 }
  patch.steps[0].notes = [60, 64, 67]
  patch.voices = patch.voices.map((voice) => ({ ...voice, pace: "1bar" }))
  return patch
}

const started = (patch: PatchJSON): Engine => {
  const engine = new Engine(patch)
  engine.start(0)
  return engine
}

const ccs = (events: EngineEvent[]) =>
  events.flatMap((event) =>
    event.type === "cc" ? [{ beat: event.beat, value: event.value }] : [],
  )

const ramp = lane([
  { time: 0, value: 0 },
  { time: 1, value: 48 },
])

describe("envelope hot-path lookup", () => {
  it("matches the linear sampler at arbitrary times and duplicate jumps", () => {
    let seed = 17
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    for (const size of [0, 1, 32, 256, 2048]) {
      const points = Array.from({ length: size }, () => ({
        time: Math.floor(random() * 100) / 10,
        value: Math.floor(random() * 128),
      })).sort((a, b) => a.time - b.time)
      const times = [
        -Infinity,
        -1,
        0,
        10,
        Infinity,
        NaN,
        ...points.map(({ time }) => time),
        ...Array.from({ length: 200 }, () => random() * 12 - 1),
      ]
      for (const shape of ["steps", "ramps"] as const) {
        for (const time of times) {
          expect(valueAt(points, time, shape)).toBe(
            linearValueAt(points, time, shape),
          )
        }
      }
    }
  })

  it("reads a logarithmic number of points instead of scanning a dense curve", () => {
    let reads = 0
    const points = new Proxy(
      Array.from({ length: 2048 }, (_, index) => ({
        time: index,
        value: index % 128,
      })),
      {
        get(target, key, receiver) {
          if (typeof key === "string" && /^\d+$/.test(key)) {
            reads++
          }
          return Reflect.get(target, key, receiver)
        },
      },
    )
    expect(valueAt(points, 0.5)).toBe(0.5)
    expect(reads).toBeLessThanOrEqual(16)
  })

  it("shares an index for an immutable envelope list and replaces it on edits", () => {
    const original = [lane([]), lane([{ time: 0, value: 127 }], 2)]
    const index = envelopeLookup(original)
    expect(envelopeLookup(original)).toBe(index)
    expect(index.firstByCC.get(74)).toBe(original[0])
    expect(index.hasPoints).toBe(true)
    const changed = [original[0]]
    expect(envelopeLookup(changed)).not.toBe(index)
    expect(envelopeLookup(changed).hasPoints).toBe(false)
    expect(envelopeLookup([ramp]).hasPoints).toBe(true)
  })

  it("keeps the first envelope for a CC, even when it is empty or on another channel", () => {
    const modulation: ModulationJSON = {
      target: { kind: "voice", voice: 0, setting: "pace" },
      cc: 74,
      from: "4th",
      to: "16th",
    }
    const patch = withEnvelopes(
      { ...createDefaultPatch(), modulations: [modulation] },
      [lane([]), lane([{ time: 0, value: 127 }], 2)],
    )
    expect(modulatedVoice(patch, 0, 0, 0).pace).toBe("8th")
    const removed = withEnvelopes(patch, [patch.steps[0].envelopes[1]])
    expect(modulatedVoice(removed, 0, 0, 0).pace).toBe("16th")
    expect(modulatedVoice(patch, 0, 0, 0).pace).toBe("8th")
  })

  it("preserves first-match queries and ordered voice/sequencer evaluation", () => {
    const voice: ModulationJSON = {
      target: { kind: "voice", voice: 0, setting: "pace" },
      cc: 74,
      from: "4th",
      to: "16th",
    }
    const size: ModulationJSON = {
      target: { kind: "sequencer", setting: "size" },
      cc: 74,
      from: 1,
      to: 4,
    }
    const items: ModulationJSON[] = [
      voice,
      size,
      { ...voice, to: "8th" },
      { ...size, to: 8 },
      {
        target: { kind: "action", setting: "sync", voice: 1 },
        cc: 74,
        from: false,
        to: true,
      },
    ]
    const patch = withEnvelopes(
      { ...createDefaultPatch(), modulations: items },
      [lane([{ time: 0, value: 127 }])],
    )
    const index = modulationLookup(items)
    expect(modulationLookup(items)).toBe(index)
    expect(modulationForCC(patch, 74)).toBe(voice)
    expect(modulationOf(patch, voice.target)).toBe(voice)
    expect(modulatedVoice(patch, 0, 0, 0).pace).toBe("8th")
    expect(modulatedVoice(patch, 1, 0, 0)).toBe(patch.voices[1])
    expect(modulatedSequencer(patch, 0, 0).size).toBe(8)
    expect(
      modulatedAction(patch, 0, 0, {
        kind: "action",
        setting: "sync",
        voice: 1,
      }),
    ).toBe(true)
    expect(
      modulatedAction(patch, 0, 0, {
        kind: "action",
        setting: "sync",
        voice: 0,
      }),
    ).toBeUndefined()
    const changed = { ...patch, modulations: items.slice(2) }
    expect(modulationLookup(changed.modulations)).not.toBe(index)
    expect(modulationOf(changed, voice.target)).toBe(items[2])
    expect(modulationForCC(patch, 74)).toBe(voice)
  })

  it("rebuilds indexes after worker-style reconstruction without changing values", () => {
    const patch = withEnvelopes(heldPatch(), [ramp])
    patch.modulations = [
      {
        target: { kind: "voice", voice: 0, setting: "transposeAmt" },
        cc: 74,
        from: 0,
        to: 12,
      },
    ]
    const reconstructed = JSON.parse(JSON.stringify(patch)) as PatchJSON
    expect(envelopeLookup(reconstructed.steps[0].envelopes)).not.toBe(
      envelopeLookup(patch.steps[0].envelopes),
    )
    expect(modulationLookup(reconstructed.modulations)).not.toBe(
      modulationLookup(patch.modulations),
    )
    expect(modulatedVoice(reconstructed, 0, 0, 0.6)).toEqual(
      modulatedVoice(patch, 0, 0, 0.6),
    )
  })
})

describe("dormant envelope sampling", () => {
  it("skips empty sample candidates while retaining landing and note behavior", () => {
    const empty = withEnvelopes(heldPatch(), [lane([])])
    const active = withEnvelopes(empty, [lane([{ time: 0, value: 0 }])])
    const skipped = started(empty).render(3.99, Infinity)
    const sampled = started(active).render(3.99, Infinity)
    expect(skipped.events).toEqual(
      sampled.events.filter((event) => event.type !== "cc"),
    )
    expect(sampled.spent - skipped.spent).toBe(191)
    expect(started(empty).render(3.99, 7).done).toBe(true)
    expect(started(active).render(3.99, 7).done).toBe(false)
  })

  it("hears an envelope added after an off-grid window at the next sample", () => {
    const patch = heldPatch()
    const engine = started(patch)
    engine.render(0.51)
    engine.setPatch(withEnvelopes(patch, [ramp]))
    expect(ccs(engine.render(0.52).events)).toEqual([])
    expect(ccs(engine.render(25 / 48).events)).toEqual([
      { beat: 25 / 48, value: 25 },
    ])
  })

  it("stops empty/removed lanes and resumes edited points on the same grid", () => {
    const patch = withEnvelopes(heldPatch(), [ramp])
    for (const envelopes of [[], [lane([])]]) {
      const engine = started(patch)
      engine.render(0.51)
      engine.setPatch(withEnvelopes(patch, envelopes))
      expect(engine.render(0.75).spent).toBe(0)
      engine.setPatch(patch)
      expect(ccs(engine.render(37 / 48).events)).toEqual([
        { beat: 37 / 48, value: 37 },
      ])
    }
  })

  it("retains the next sample across a snapshot made on an empty step", () => {
    const patch = heldPatch()
    const engine = started(patch)
    engine.render(0.51)
    const edited = withEnvelopes(patch, [ramp])
    const fork = new Engine(edited, { from: engine.snapshot() })
    engine.setPatch(edited)
    expect(ccs(fork.render(25 / 48).events)).toEqual([
      { beat: 25 / 48, value: 25 },
    ])
    expect(ccs(engine.render(25 / 48).events)).toEqual([
      { beat: 25 / 48, value: 25 },
    ])
  })

  it("never resumes before the reached beat of a budget-limited render", () => {
    const patch = heldPatch()
    patch.voices[0] = { ...patch.voices[0], pace: "8th", length: 0.4 }
    const engine = started(patch)
    const first = engine.render(0.51, 5)
    expect(first.done).toBe(false)
    expect(first.beat).toBe(0.2)
    engine.setPatch(withEnvelopes(patch, [ramp]))
    const next = [...renderThrough(engine, 0.51, 1)]
    expect(next.every((event) => event.beat >= first.beat)).toBe(true)
    expect(ccs(next)[0]).toEqual({ beat: 10 / 48, value: 10 })
  })

  it("can resume on the reached beat when that boundary is still unrendered", () => {
    const patch = heldPatch()
    patch.voices[0] = { ...patch.voices[0], pace: "8th", length: 1 }
    const engine = started(patch)
    const first = engine.render(0.75, 5)
    expect(first.done).toBe(false)
    expect(first.beat).toBe(0.5)
    engine.setPatch(withEnvelopes(patch, [ramp]))
    expect(ccs(engine.render(0.5).events)).toEqual([{ beat: 0.5, value: 24 }])
  })

  it("keeps zero-budget calls from skipping an unprocessed landing", () => {
    const patch = heldPatch()
    const engine = started(patch)
    expect(engine.render(0.51, 0).done).toBe(false)
    engine.setPatch(withEnvelopes(patch, [ramp]))
    expect(ccs(engine.render(0).events)).toEqual([{ beat: 0, value: 0 }])
  })

  it("reads a redraw at the next sample without replacing the landing context", () => {
    const patch = withEnvelopes(heldPatch(), [ramp])
    const engine = started(patch)
    engine.render(0.51)
    const before = engine.snapshot().runtime.envelope
    engine.setPatch(withEnvelopes(patch, [lane([{ time: 0, value: 100 }])]))
    expect(ccs(engine.render(25 / 48).events)).toEqual([
      { beat: 25 / 48, value: 100 },
    ])
    expect(engine.snapshot().runtime.envelope).toMatchObject({
      step: before?.step,
      startBeat: before?.startBeat,
      lengthBeats: before?.lengthBeats,
    })
  })

  it("keeps Hold/Sync and random output deterministic across small budgets", () => {
    const patch = heldPatch()
    patch.voices[0] = {
      ...patch.voices[0],
      pace: "8thT",
      rule: "random",
      pattern: patch.voices[0].pattern.map((dot) => ({
        ...dot,
        probability: 50,
      })),
    }
    for (const envelopes of [[], [ramp]]) {
      const each = withEnvelopes(patch, envelopes)
      const make = () => {
        const engine = started(each)
        engine.setActions({ hold: true, sync: true })
        engine.selectedVoice = 1
        return engine
      }
      expect([...renderThrough(make(), 7.99, 1)]).toEqual(
        make().render(7.99, Infinity).events,
      )
    }
  })
})
