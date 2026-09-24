import { beforeEach, describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON, VoiceJSON } from "../entities/types"
import { Engine } from "./Engine"
import { EngineEvent, NoteOnEvent } from "./events"

const soloVoice = (patch: PatchJSON, overrides: Partial<VoiceJSON> = {}) => {
  patch.voices.forEach((voice, index) => {
    voice.enabled = index === 0
  })
  Object.assign(patch.voices[0], { pace: "4th", length: 0.5 }, overrides)
  return patch
}

const notesOn = (events: EngineEvent[]) =>
  events.filter((e): e is NoteOnEvent => e.type === "noteOn").map((e) => e.note)

// a playhead move with Flip off, so the stored step is the grid position
const step = (beat: number, position: number, voiceDots: number[]) => ({
  type: "step",
  beat,
  position,
  step: position,
  voiceDots,
})

const voiceDotsOf = (events: EngineEvent[]) =>
  events.flatMap((e) => (e.type === "step" ? [e.voiceDots] : []))

const positions = (events: EngineEvent[]) =>
  events.filter((e) => e.type === "step").map((e) => e.position)

const beatsOf = (events: EngineEvent[], type: EngineEvent["type"]) =>
  events.filter((e) => e.type === type).map((e) => e.beat)

describe("Engine", () => {
  let patch: PatchJSON

  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "4th"
    soloVoice(patch)
    patch.steps[0].notes = [60]
    patch.steps[1].notes = [62]
  })

  it("plays one note per step and loops over the recorded steps", () => {
    const engine = new Engine(patch)
    engine.start(0)
    const events = engine.render(3.9)

    expect(events).toEqual([
      step(0, 0, [0, 0, 0, 0]),
      { type: "noteOn", beat: 0, voice: 0, note: 60, velocity: 64, channel: 1 },
      { type: "noteOff", beat: 0.5, voice: 0, note: 60, channel: 1 },
      step(1, 1, [1, 2, 2, 2]),
      { type: "noteOn", beat: 1, voice: 0, note: 62, velocity: 64, channel: 1 },
      { type: "noteOff", beat: 1.5, voice: 0, note: 62, channel: 1 },
      step(2, 0, [2, 4, 4, 4]),
      { type: "noteOn", beat: 2, voice: 0, note: 60, velocity: 64, channel: 1 },
      { type: "noteOff", beat: 2.5, voice: 0, note: 60, channel: 1 },
      step(3, 1, [3, 6, 6, 6]),
      { type: "noteOn", beat: 3, voice: 0, note: 62, velocity: 64, channel: 1 },
      { type: "noteOff", beat: 3.5, voice: 0, note: 62, channel: 1 },
    ])
  })

  describe("where each voice is on a step", () => {
    it("names the dot each voice plays first, which runs on without sync", () => {
      // voice 1 at 4ths plays a dot a step; the others, at 8ths, two
      const engine = new Engine(patch)
      engine.start(0)
      expect(voiceDotsOf(engine.render(2.9))).toEqual([
        [0, 0, 0, 0],
        [1, 2, 2, 2],
        [2, 4, 4, 4],
      ])
    })

    it("wraps at the pattern's length", () => {
      patch.voices[1].patternLength = 3
      const engine = new Engine(patch)
      engine.start(0)
      // 8ths through a three-dot pattern: 0, 2, 4 % 3, 6 % 3
      expect(voiceDotsOf(engine.render(3.9)).map((dots) => dots[1])).toEqual([
        0, 2, 1, 0,
      ])
    })

    it("starts every voice at its first dot on every step with sync", () => {
      patch.syncVoices = true
      const engine = new Engine(patch)
      engine.start(0)
      expect(voiceDotsOf(engine.render(2.9))).toEqual([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ])
    })

    it("counts triplets onto the step they belong to", () => {
      // three 8th triplets to a quarter-note step, however long it runs
      patch.voices[0].pace = "8thT"
      const engine = new Engine(patch)
      engine.start(0)
      expect(voiceDotsOf(engine.render(4.9)).map((dots) => dots[0])).toEqual([
        0, 3, 6, 9, 12,
      ])
    })

    it("names the dot a slow voice plays next, even steps away", () => {
      // a half-note voice ticks on every other quarter-note step
      patch.voices[0].pace = "2nd"
      const engine = new Engine(patch)
      engine.start(0)
      expect(voiceDotsOf(engine.render(3.9)).map((dots) => dots[0])).toEqual([
        0, 1, 1, 2,
      ])
    })
  })

  it("plays each triplet once where a step starts, with sync", () => {
    // Added-up triplets once fell just short of the step, so the voice
    // ticked, then sync reset it and it ticked again on the step itself.
    patch.syncVoices = true
    patch.voices[0].pace = "8thT"
    patch.loop = { mode: "custom", end: 0 }
    const engine = new Engine(patch)
    engine.start(0)

    const onBeats = beatsOf(engine.render(2.9), "noteOn")
    expect(onBeats).toHaveLength(9)
    expect(new Set(onBeats).size).toBe(9)
    expect(onBeats.filter((beat) => Number.isInteger(beat))).toEqual([0, 1, 2])
  })

  it("continues across render windows without gaps or repeats", () => {
    const engine = new Engine(patch)
    engine.start(0)
    const windowed = [
      ...engine.render(0.75),
      ...engine.render(1.6),
      ...engine.render(3.9),
    ]

    const whole = new Engine(patch)
    whole.start(0)
    expect(windowed).toEqual(whole.render(3.9))
  })

  it("uses the lowest four notes, one for each voice", () => {
    patch.steps[0].notes = [48, 55, 60, 64, 72]
    patch.voices[0].rule = "up"
    // stay on the chord so the rule only sees the notes it can reach
    patch.loop = { mode: "custom", end: 0 }

    const engine = new Engine(patch)
    engine.start(0)
    expect(notesOn(engine.render(3.9))).toEqual([48, 55, 60, 64])
  })

  describe("step CCs", () => {
    beforeEach(() => {
      patch.steps[0].ccs = [{ id: 1, cc: 74, value: 100, channel: 3 }]
    })

    it("fires on landing, before that beat's notes", () => {
      const engine = new Engine(patch)
      engine.start(0)
      const events = engine.render(0.1)

      expect(events.slice(0, 3)).toEqual([
        step(0, 0, [0, 0, 0, 0]),
        {
          type: "cc",
          beat: 0,
          cc: 74,
          value: 100,
          channel: 3,
          output: "all",
          source: "step",
        },
        {
          type: "noteOn",
          beat: 0,
          voice: 0,
          note: 60,
          velocity: 64,
          channel: 1,
        },
      ])
    })

    it("fires on a rest but never on a skipped step", () => {
      patch.steps[0].state = "rest"
      const resting = new Engine(patch)
      resting.start(0)
      const restEvents = resting.render(0.1)
      expect(restEvents.some((e) => e.type === "cc")).toBe(true)
      expect(restEvents.some((e) => e.type === "noteOn")).toBe(false)

      patch.steps[0].state = "skip"
      const skipping = new Engine(patch)
      skipping.start(0)
      expect(skipping.render(3.9).some((e) => e.type === "cc")).toBe(false)
    })

    it("sends on its own channel, to every output", () => {
      patch.steps[0].ccs = [{ id: 1, cc: 74, value: 10, channel: 9 }]
      patch.voices[2].channel = 3

      const engine = new Engine(patch)
      engine.start(0)
      const cc = engine.render(0.1).find((e) => e.type === "cc")
      // the voices' own channels have nothing to do with it
      expect(cc).toMatchObject({ channel: 9, output: "all" })
    })
  })

  describe("jumps", () => {
    it("takes the destination when the rule passes and the normal when it fails", () => {
      patch.steps[2].notes = [64]
      patch.steps[0].jump = {
        rule: { kind: "times", n: 1 },
        dest: 2,
        normal: null,
      }

      const engine = new Engine(patch)
      engine.start(0)
      // step 0 jumps to 2 on its first visit, then falls through to 1
      expect(positions(engine.render(5.9))).toEqual([0, 2, 0, 1, 2, 0])
    })

    it("walks back into the loop range from a destination outside it", () => {
      patch.loop = { mode: "custom", end: 1 }
      patch.steps[0].jump = { rule: { kind: "always" }, dest: 40, normal: null }

      const engine = new Engine(patch)
      engine.start(0)
      expect(positions(engine.render(2.9))).toEqual([0, 0, 0])
    })

    it("honours an explicit normal step", () => {
      patch.steps[3].notes = [65]
      patch.steps[0].jump = {
        rule: { kind: "notLast" },
        dest: 1,
        normal: 3,
      }

      const engine = new Engine(patch)
      engine.start(0)
      expect(positions(engine.render(1.1))).toEqual([0, 1])
    })
  })

  describe("actions", () => {
    it("hang freezes the step while the voice keeps playing", () => {
      const engine = new Engine(patch)
      engine.start(0)
      engine.render(0.1)
      engine.setActions({ hang: true })
      const held = engine.render(2.9)

      expect(positions(held)).toEqual([])
      expect(notesOn(held)).toEqual([60, 60])

      // releasing hang resumes in phase rather than catching up
      engine.setActions({ hang: false })
      expect(positions(engine.render(3.1))).toEqual([1])
    })

    it("flip swaps the grid axes", () => {
      patch.steps[8].notes = [67]
      const engine = new Engine(patch)
      engine.setActions({ flip: true })
      engine.start(0)
      // position 1 reads stored step 8 when flipped
      const events = engine.render(1.1)
      expect(events.filter((e) => e.type === "step")).toMatchObject([
        { position: 0, step: 0 },
        { position: 1, step: 8 },
      ])
      expect(notesOn(events)).toEqual([60, 67])
    })

    it("shift transposes notes that start while it is held", () => {
      const engine = new Engine(patch)
      engine.start(0)
      expect(notesOn(engine.render(0.1))).toEqual([60])

      engine.setActions({ shift: true })
      expect(notesOn(engine.render(1.1))).toEqual([62 + 12])

      engine.setActions({ shift: false })
      expect(notesOn(engine.render(2.1))).toEqual([60])
    })

    it("bump inverts sync voices while held", () => {
      patch.pace = "2nd"
      patch.steps[0].notes = [60, 64, 67]
      patch.steps[1].notes = [60, 64, 67]
      patch.voices[0].rule = "up"

      const running = new Engine(patch)
      running.start(0)
      expect(notesOn(running.render(1.9))).toEqual([60, 64])
      // with sync off the arpeggio carries on over the step change
      expect(notesOn(running.render(3.9))).toEqual([67, 60])

      const bumped = new Engine(patch)
      bumped.start(0)
      bumped.render(1.9)
      bumped.setActions({ bump: true })
      // bump switches sync on, so the next step restarts the arpeggio
      expect(notesOn(bumped.render(3.9))).toEqual([60, 64])
    })
  })

  it("sync voices restarts each voice's pattern and rule on every step", () => {
    patch.pace = "2nd"
    patch.syncVoices = true
    patch.steps[0].notes = [60, 64, 67]
    patch.steps[1].notes = [60, 64, 67]
    patch.voices[0].rule = "up"

    const engine = new Engine(patch)
    engine.start(0)
    // the sequencer advances every 2 beats, so the arpeggio restarts there
    expect(notesOn(engine.render(3.9))).toEqual([60, 64, 60, 64])
  })

  describe("pattern step options", () => {
    it("ratchets into evenly spaced hits", () => {
      patch.voices[0].pattern[0].ratchet = 3
      const engine = new Engine(patch)
      engine.start(0)
      const events = engine.render(0.9)

      const round = (beats: number[]) =>
        beats.map((beat) => Math.round(beat * 1e6) / 1e6)

      expect(round(beatsOf(events, "noteOn"))).toEqual([0, 0.333333, 0.666667])
      // each hit keeps its own gate length
      expect(round(beatsOf(events, "noteOff"))).toEqual([
        0.166667, 0.5, 0.833333,
      ])
    })

    it("accents up and down by the accent amount", () => {
      patch.voices[0].pattern[0].accent = "+"
      patch.voices[0].pattern[1].accent = "-"
      patch.voices[0].patternLength = 2

      const engine = new Engine(patch, { accentAmount: 20 })
      engine.start(0)
      const velocities = engine
        .render(1.1)
        .filter((e): e is NoteOnEvent => e.type === "noteOn")
        .map((e) => e.velocity)
      expect(velocities).toEqual([84, 44])
    })

    it("hold sustains the previous note through the dot", () => {
      patch.voices[0].length = 0.5
      patch.voices[0].patternLength = 2
      patch.voices[0].pattern[1].articulation = "hold"

      const engine = new Engine(patch)
      engine.start(0)
      const events = engine.render(1.9)

      expect(beatsOf(events, "noteOn")).toEqual([0])
      // 1 beat of hold plus the 0.5 gate of the sounding dot
      expect(beatsOf(events, "noteOff")).toEqual([1.5])
    })

    it("tie keeps the old note sounding until the new note starts", () => {
      patch.voices[0].length = 1
      patch.voices[0].patternLength = 2
      patch.voices[0].pattern[1].articulation = "tie"
      patch.pace = "2nd"
      patch.steps[0].notes = [60, 64]
      patch.voices[0].rule = "up"

      const engine = new Engine(patch)
      engine.start(0)
      const events = engine.render(1.1)

      expect(events.filter((e) => e.type !== "step")).toEqual([
        {
          type: "noteOn",
          beat: 0,
          voice: 0,
          note: 60,
          velocity: 64,
          channel: 1,
        },
        {
          type: "noteOn",
          beat: 1,
          voice: 0,
          note: 64,
          velocity: 64,
          channel: 1,
        },
        { type: "noteOff", beat: 1, voice: 0, note: 60, channel: 1 },
      ])
    })

    it("skips a dot when probability or condition fails", () => {
      patch.voices[0].patternLength = 2
      patch.voices[0].pattern[1].condition = "2:2"
      patch.voices[0].pattern[1].probability = 100

      const engine = new Engine(patch)
      engine.start(0)
      // dot 1 only plays on its second visit
      expect(beatsOf(engine.render(3.9), "noteOn")).toEqual([0, 2, 3])
    })
  })

  it("keeps a dotted pace drifting against the straight grid", () => {
    patch.voices[0].pace = "4thD"
    const engine = new Engine(patch)
    engine.start(0)
    const beats = beatsOf(engine.render(3.9), "noteOn")

    // every note and a half, so it lands off the beat every other time
    expect(beats).toEqual([0, 1.5, 3])
  })

  it("queues a step for the next advance", () => {
    patch.steps[5].notes = [70]
    patch.loop = { mode: "all", end: 63 }

    const engine = new Engine(patch)
    engine.start(0)
    engine.render(0.1)
    engine.queueStep(5)
    expect(positions(engine.render(1.1))).toEqual([5])
    expect(positions(engine.render(2.1))).toEqual([6])
  })

  it("repeats exactly for a given seed and differs for another", () => {
    patch.direction = "random"
    patch.voices[0].rule = "random"
    patch.steps[0].notes = [60, 64, 67, 72]
    patch.loop = { mode: "custom", end: 7 }

    const run = (seed: number) => {
      const engine = new Engine(patch, { seed })
      engine.start(0)
      return engine.render(15.9)
    }

    expect(run(7)).toEqual(run(7))
    expect(run(7)).not.toEqual(run(8))
  })

  it("releases sounding notes on stop", () => {
    patch.voices[0].length = 1
    const engine = new Engine(patch)
    engine.start(0)
    engine.render(0.1)

    expect(engine.stop(0.5)).toEqual([
      { type: "noteOff", beat: 0.5, voice: 0, note: 60, channel: 1 },
    ])
    expect(engine.render(4)).toEqual([])
  })

  it("emits enabled mod outs as CCs on each step", () => {
    patch.steps[19].notes = [64]
    const phase = patch.modOuts.find((m) => m.source === "phase")
    if (phase !== undefined) {
      phase.enabled = true
      phase.cc = 21
    }

    const engine = new Engine(patch)
    engine.start(0)
    const mods = engine
      .render(1.1)
      .filter((e) => e.type === "cc" && e.source === "mod")
    expect(mods).toMatchObject([
      { cc: 21, value: 0, beat: 0 },
      { cc: 21, value: Math.round((1 / 19) * 127), beat: 1 },
    ])
  })
})
