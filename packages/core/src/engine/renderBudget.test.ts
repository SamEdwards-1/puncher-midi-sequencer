import { describe, expect, it } from "vitest"
import { addEnvelope } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import { MAX_PACE_BEATS, paceBeats } from "../entities/paces"
import { PatchJSON } from "../entities/types"
import { renderSequence } from "../file/midiExport"
import { Engine, EngineRender, RENDER_BUDGET, renderThrough } from "./Engine"
import { CCOutEvent, EngineEvent, NoteOnEvent } from "./events"
import { playRound, previewStep, stepEvents } from "./stepPreview"

const BEAT_EPSILON = 1e-9
// the dots a voice at the fastest pace plays across the longest step
const DOTS = MAX_PACE_BEATS / paceBeats("32ndT")
const HITS = 4
// every voice's notes on one of the busiest steps, each dot ratcheted
const NOTES_PER_STEP = 4 * DOTS * HITS
const RAMP_CC = 3

/**
 * Two steps as busy as a step gets: the longest pace, every voice at the
 * fastest with every dot ratcheted as far as it goes, and on the first an
 * envelope ramping a modulated transpose all the way across it.
 */
const busiest = (): PatchJSON => {
  const patch = createDefaultPatch()
  patch.pace = "16bar"
  patch.steps[0].notes = [60, 64, 67]
  patch.steps[1].notes = [62, 65, 69]
  patch.voices = patch.voices.map((voice) => ({
    ...voice,
    enabled: true,
    pace: "32ndT",
    length: 0.1,
    pattern: voice.pattern.map((dot) => ({ ...dot, ratchet: HITS })),
  }))
  return addEnvelope(
    {
      ...patch,
      modulations: [
        {
          target: { kind: "voice", voice: 0, setting: "transposeAmt" },
          cc: RAMP_CC,
          from: 0,
          to: 12,
        },
      ],
    },
    0,
    {
      cc: RAMP_CC,
      channel: 1,
      shape: "ramps",
      points: [
        { time: 0, value: 0 },
        { time: MAX_PACE_BEATS, value: 127 },
      ],
    },
  )
}

const started = (patch = busiest()) => {
  const engine = new Engine(patch)
  engine.start(0)
  return engine
}

// the first step, whole, in one render with no budget to run out of
const unbounded = (toBeat = MAX_PACE_BEATS - BEAT_EPSILON) =>
  started().render(toBeat, Infinity)

// the first step a budget at a time, each render as it came back
const chunked = (budget: number, toBeat = MAX_PACE_BEATS - BEAT_EPSILON) => {
  const engine = started()
  const renders: EngineRender[] = []
  do {
    renders.push(engine.render(toBeat, budget))
  } while (!renders[renders.length - 1].done)
  return renders
}

const noteOns = (events: Iterable<EngineEvent>) =>
  [...events].filter((event): event is NoteOnEvent => event.type === "noteOn")

const ramp = (events: EngineEvent[]) =>
  events.filter(
    (event): event is CCOutEvent => event.type === "cc" && event.cc === RAMP_CC,
  )

describe("rendering a budget at a time", () => {
  it("takes several budgets for the busiest step", () => {
    const whole = unbounded()
    expect(whole.done).toBe(true)
    expect(whole.spent).toBeGreaterThan(2 * RENDER_BUDGET)
    expect(noteOns(whole.events)).toHaveLength(NOTES_PER_STEP)
  })

  it("stops where its budget runs out and says so, leaving nothing out", () => {
    const renders = chunked(1000)
    expect(renders.length).toBeGreaterThan(9)
    for (const render of renders.slice(0, -1)) {
      expect(render.done).toBe(false)
      expect(render.spent).toBe(1000)
      expect(render.beat).toBeLessThan(MAX_PACE_BEATS)
    }
    const last = renders[renders.length - 1]
    expect(last.spent).toBeLessThanOrEqual(1000)
    expect(last.beat).toBe(MAX_PACE_BEATS - BEAT_EPSILON)
    expect(renders.flatMap((render) => render.events)).toEqual(
      unbounded().events,
    )
  })

  it("has rendered everything before the beat it stops at", () => {
    const renders = chunked(97)
    renders.forEach((render, index) => {
      const later = renders.slice(index + 1).flatMap(({ events }) => events)
      expect(later.every((event) => event.beat >= render.beat)).toBe(true)
      if (index > 0) {
        expect(render.beat).toBeGreaterThanOrEqual(renders[index - 1].beat)
      }
    })
  })

  it("plays nothing on a budget of nothing, but says whether it is done", () => {
    const engine = started()
    expect(engine.render(4, 0)).toEqual({
      events: [],
      done: false,
      beat: 0,
      spent: 0,
    })
    expect(noteOns(renderThrough(engine, 4)).length).toBeGreaterThan(0)
    expect(engine.render(4, 0)).toEqual({
      events: [],
      done: true,
      beat: 4,
      spent: 0,
    })
  })

  it("is done at once while stopped", () => {
    expect(new Engine(busiest()).render(4)).toEqual({
      events: [],
      done: true,
      beat: 4,
      spent: 0,
    })
  })

  it("renders through a beat whole, whatever the budget", () => {
    const toBeat = 2 * MAX_PACE_BEATS - BEAT_EPSILON
    const whole = unbounded(toBeat).events
    expect(noteOns(whole)).toHaveLength(2 * NOTES_PER_STEP)
    expect([...renderThrough(started(), toBeat)]).toEqual(whole)
    expect([...renderThrough(started(), toBeat, 7)]).toEqual(whole)
    expect(() => [...renderThrough(started(), toBeat, 0)]).toThrow(RangeError)
  })

  it("rolls the same chances however it is split up", () => {
    const random = busiest()
    random.voices = random.voices.map((voice) => ({
      ...voice,
      rule: "random",
      pattern: voice.pattern.map((dot) => ({ ...dot, probability: 50 })),
    }))
    const toBeat = MAX_PACE_BEATS - BEAT_EPSILON
    expect([...renderThrough(started(random), toBeat, 13)]).toEqual(
      started(random).render(toBeat, Infinity).events,
    )
  })
})

describe("the busiest steps, rendered a budget at a time", () => {
  it("export every note and CC of every pass", () => {
    const passes = 2
    const events = renderSequence(busiest(), {
      voices: [],
      ccs: [],
      layout: "combined",
      passes,
    })
    const ons = noteOns(events)
    expect(ons).toHaveLength(passes * 2 * NOTES_PER_STEP)
    expect(events.filter((event) => event.type === "noteOff")).toHaveLength(
      ons.length,
    )
    // the last ratchet hit of the last dot of the last step
    const end = passes * 2 * MAX_PACE_BEATS
    expect(ons[ons.length - 1].beat).toBeCloseTo(end - 1 / 48, 9)
    // the ramp goes all the way up on the first step of each pass
    const ramped = ramp(events)
    for (let pass = 0; pass < passes; pass++) {
      const start = pass * 2 * MAX_PACE_BEATS
      const onStep = ramped.filter(
        ({ beat }) => beat >= start && beat < start + MAX_PACE_BEATS,
      )
      expect(onStep[0].value).toBe(0)
      expect(onStep[onStep.length - 1].value).toBe(127)
    }
  })

  it("preview a step whole, played on from the one before", () => {
    const { notes } = previewStep(busiest(), 1)
    expect(notes).toHaveLength(NOTES_PER_STEP)
    expect(Math.max(...notes.map(({ start }) => start))).toBeCloseTo(
      1 - 1 / 48 / MAX_PACE_BEATS,
      9,
    )
  })

  it("preview a step's notes and CCs whole", () => {
    const events = stepEvents(busiest(), 0)
    expect(noteOns(events)).toHaveLength(NOTES_PER_STEP)
    const ramped = ramp(events)
    expect(ramped[ramped.length - 1].value).toBe(127)
    // voice 1's transpose has ramped up an octave by the step's end
    const firstVoice = noteOns(events).filter(({ voice }) => voice === 0)
    expect(firstVoice[0].note).toBe(60)
    expect(firstVoice[firstVoice.length - 1].note).toBe(72)
  })

  it("play each round whole", () => {
    const engine = started()
    for (const step of [0, 1, 0]) {
      const round = playRound(engine)
      expect(round.step).toBe(step)
      expect(round.length).toBe(MAX_PACE_BEATS)
      expect(round.notes).toHaveLength(NOTES_PER_STEP)
    }
  })
})
