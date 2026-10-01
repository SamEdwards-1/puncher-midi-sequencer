import { bench, describe } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { valueAt } from "../entities/envelope"
import { modulatedSequencer, modulatedVoice } from "../entities/modulation"
import { EnvelopePointJSON, VoiceIndex } from "../entities/types"
import { Engine, renderThrough } from "./Engine"

// Keep a linear reference so both algorithms run under the same benchmark
// runner, machine and query stream. Use no timing assertions in unit tests.
const linearValueAt = (points: EnvelopePointJSON[], time: number) => {
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
      if (next === undefined || next.time === point.time) {
        return point.value
      }
      const along = (time - point.time) / (next.time - point.time)
      return point.value + (next.value - point.value) * along
    }
  }
  return points[0].value
}

let checksum = 0

for (const size of [0, 32, 256, 2048]) {
  describe(`envelope lookup: ${size} points`, () => {
    const points = Array.from({ length: size }, (_, index) => ({
      time: (index * 64) / Math.max(1, size - 1),
      value: index % 128,
    }))
    const patch = createDefaultPatch()
    patch.pace = "16bar"
    patch.loop = { mode: "custom", end: 0 }
    patch.steps[0].notes = [60, 64, 67, 72]
    patch.voices = patch.voices.map((voice, index) => ({
      ...voice,
      enabled: true,
      pace: "32ndT",
      rule: index === 0 ? "random" : voice.rule,
    }))
    patch.steps[0].envelopes = [0, 1, 2, 3].map((index) => ({
      id: index,
      cc: 3 + index,
      channel: 1,
      points,
    }))
    patch.modulations = [0, 1, 2, 3].map((index) => ({
      target: {
        kind: "voice",
        voice: index as VoiceIndex,
        setting: "transposeAmt",
      },
      cc: 3 + index,
      from: 0,
      to: 12,
    }))
    patch.modulations.push({
      target: { kind: "sequencer", setting: "maxNotesPerStep" },
      cc: 3,
      from: 1,
      to: 4,
    })

    bench("linear sampler: 1,000 arbitrary-time reads", () => {
      for (let query = 0; query < 1000; query++) {
        checksum += linearValueAt(points, ((query * 37) % 1000) * 0.064) ?? 0
      }
    })
    bench("binary sampler: 1,000 arbitrary-time reads", () => {
      for (let query = 0; query < 1000; query++) {
        checksum += valueAt(points, ((query * 37) % 1000) * 0.064) ?? 0
      }
    })
    bench("indexed modulation: all four voices and the sequencer", () => {
      for (let query = 0; query < 100; query++) {
        const time = ((query * 37) % 100) * 0.64
        for (const voice of [0, 1, 2, 3] as const) {
          checksum += modulatedVoice(patch, voice, 0, time).transposeAmt
        }
        checksum += modulatedSequencer(patch, 0, time).maxNotesPerStep
      }
    })
    bench("engine: complete 16-bar round in small budgets", () => {
      const engine = new Engine(patch, { seed: 17 })
      engine.start()
      for (const event of renderThrough(engine, 63.999, 97)) {
        checksum += event.beat
      }
    })
  })
}

// An observable result also makes it easy to check a runner actually did work.
export const envelopeBenchmarkChecksum = () => checksum
