import { beforeEach, describe, expect, it } from "vitest"
import { addEnvelope } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import {
  ActionTarget,
  EnvelopePointJSON,
  ModulationJSON,
  PatchJSON,
} from "../entities/types"
import { exportBeats, renderSequence } from "../file/midiExport"
import { Engine } from "./Engine"
import { EngineEvent, NoteOffEvent, NoteOnEvent } from "./events"
import { stepNotes } from "./stepPreview"

const noteOns = (events: EngineEvent[]) =>
  events.filter((event): event is NoteOnEvent => event.type === "noteOn")

const noteOffs = (events: EngineEvent[]) =>
  events.filter((event): event is NoteOffEvent => event.type === "noteOff")

const stepBeats = (events: EngineEvent[]) =>
  events.filter((event) => event.type === "step").map((event) => event.beat)

const play = (patch: PatchJSON, toBeat: number) => {
  const engine = new Engine(patch)
  engine.start(0)
  return engine.render(toBeat).events
}

describe("modulation as the sequence plays", () => {
  let patch: PatchJSON

  // Two one-bar steps, played by voice 1 alone, a note a quarter.
  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "1bar"
    patch.steps[0].notes = [60]
    patch.steps[1].notes = [64]
    patch.voices[0] = { ...patch.voices[0], pace: "4th", length: 0.5 }
  })

  const modulate = (
    modulation: ModulationJSON,
    ...onSteps: [step: number, points: EnvelopePointJSON[]][]
  ) => {
    patch = onSteps.reduce(
      (next, [step, points]) =>
        addEnvelope(next, step, { cc: modulation.cc, channel: 1, points }),
      { ...patch, modulations: [...patch.modulations, modulation] },
    )
  }
  const at = (value: number) => [{ time: 0, value }]

  it("starts a newly modulated bouncing direction in its named direction", () => {
    patch.size = 4
    patch.loop.mode = "all"
    modulate(
      {
        target: { kind: "sequencer", setting: "direction" },
        cc: 3,
        from: "fwd",
        to: "bwdfwd",
      },
      [1, at(127)],
    )
    expect(
      play(patch, 8)
        .filter((event) => event.type === "step")
        .map((event) => event.step),
    ).toEqual([0, 1, 0])
  })

  it("uses the modulated size when mapping flipped positions", () => {
    patch.size = 4
    patch.loop.mode = "all"
    modulate(
      { target: { kind: "sequencer", setting: "size" }, cc: 3, from: 4, to: 9 },
      [0, at(127)],
    )
    const engine = new Engine(patch)
    engine.setActions({ flip: true })
    engine.start()
    expect(
      engine
        .render(4)
        .events.filter((event) => event.type === "step")
        .map((event) => event.step),
    ).toEqual([0, 3])
    expect(patch.size).toBe(4)
  })

  it("shrinks the navigation range on leaving a step and restores the base size elsewhere", () => {
    patch.size = 4
    patch.loop.mode = "all"
    modulate(
      { target: { kind: "sequencer", setting: "size" }, cc: 3, from: 1, to: 2 },
      [1, at(127)],
    )
    const steps = play(patch, 12).filter((event) => event.type === "step")
    expect(steps.map((event) => event.step)).toEqual([0, 1, 0, 1])
    expect(patch.size).toBe(4)
    expect(patch.steps).toHaveLength(64)
  })

  it("reads direction from the outgoing envelope and returns to the base direction", () => {
    patch.size = 4
    patch.loop.mode = "all"
    modulate(
      {
        target: { kind: "sequencer", setting: "direction" },
        cc: 3,
        from: "fwd",
        to: "bwd",
      },
      [0, at(127)],
    )
    expect(
      play(patch, 8)
        .filter((event) => event.type === "step")
        .map((event) => event.step),
    ).toEqual([0, 3, 0])
  })

  it("modulates the loop mode, keeping its custom end", () => {
    patch.size = 4
    patch.loop = { mode: "all", end: 1 }
    modulate(
      {
        target: { kind: "sequencer", setting: "loop" },
        cc: 3,
        from: "recorded",
        to: "custom",
      },
      [1, at(127)],
    )
    expect(
      play(patch, 12)
        .filter((event) => event.type === "step")
        .map((event) => event.step),
    ).toEqual([0, 1, 0, 1])
    expect(patch.loop).toEqual({ mode: "all", end: 1 })
  })

  it("changes the transpose amount across a step only while Transpose is active", () => {
    modulate(
      {
        target: { kind: "sequencer", setting: "transposeAmt" },
        cc: 3,
        from: 0,
        to: 12,
      },
      [
        0,
        [
          { time: 0, value: 0 },
          { time: 2, value: 127 },
        ],
      ],
    )
    patch.steps[0].envelopes[0].shape = "steps"
    expect(noteOns(play(patch, 3.9)).map((event) => event.note)).toEqual([
      60, 60, 60, 60,
    ])
    const engine = new Engine(patch)
    engine.setActions({ transpose: true })
    engine.start()
    expect(
      noteOns(engine.render(3.9).events).map((event) => event.note),
    ).toEqual([60, 60, 72, 72])
  })

  it("changes the number of available step notes without deleting any", () => {
    patch.steps[0].notes = [60, 64, 67, 72]
    patch.voices[0].rule = "highest"
    modulate(
      {
        target: { kind: "sequencer", setting: "maxNotesPerStep" },
        cc: 3,
        from: 1,
        to: 4,
      },
      [
        0,
        [
          { time: 0, value: 0 },
          { time: 2, value: 127 },
        ],
      ],
    )
    patch.steps[0].envelopes[0].shape = "steps"
    expect(noteOns(play(patch, 3.9)).map((event) => event.note)).toEqual([
      60, 60, 72, 72,
    ])
    expect(patch.steps[0].notes).toEqual([60, 64, 67, 72])
  })

  it("plays a voice at the pace its CC's envelope has on the step, and at its own elsewhere", () => {
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "pace" },
        cc: 3,
        from: "4th",
        to: "8th",
      },
      [0, at(127)],
    )
    const notes = noteOns(play(patch, 7.9))
    // eighths on the first step, quarters on the second
    expect(notes.map(({ beat }) => beat)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7,
    ])
  })

  it("follows the envelope as it changes across the step", () => {
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "transposeAmt" },
        cc: 3,
        from: 0,
        to: 12,
      },
      [
        0,
        [
          { time: 0, value: 0 },
          { time: 2, value: 127 },
        ],
      ],
    )
    patch.steps[0].envelopes[0].shape = "steps"
    const notes = noteOns(play(patch, 3.9))
    expect(notes.map(({ note }) => note)).toEqual([60, 60, 72, 72])
  })

  it("sends the envelope out as its CC, as any step's is, marked as a modulation's", () => {
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "transposeAmt" },
        cc: 3,
        from: 0,
        to: 12,
      },
      [0, at(127)],
    )
    patch = addEnvelope(patch, 0, { cc: 74, channel: 1, points: at(20) })
    expect(play(patch, 0).filter((event) => event.type === "cc")).toMatchObject(
      [
        { cc: 3, value: 127, channel: 1, source: "modulation" },
        { cc: 74, value: 20, channel: 1, source: "step" },
      ],
    )
  })

  it("holds each note for its modulated length", () => {
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "length" },
        cc: 3,
        from: 0.1,
        to: 1,
      },
      [0, at(127)],
    )
    const offs = noteOffs(play(patch, 1.9))
    expect(offs[0].beat).toBe(1)
  })

  it("picks notes by the modulated rule", () => {
    patch.steps[0].notes = [60, 64, 67]
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "rule" },
        cc: 3,
        from: "nth",
        to: "highest",
      },
      [0, at(127)],
    )
    expect(noteOns(play(patch, 0))[0].note).toBe(67)
  })

  it("wraps the pattern at its modulated length", () => {
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "patternLength" },
        cc: 3,
        from: 1,
        to: 16,
      },
      [0, at(0)],
    )
    const dots = play(patch, 3.9).flatMap((event) =>
      event.type === "dot" && event.voice === 0 ? [event.dot] : [],
    )
    expect(dots).toEqual([0, 0, 0, 0])
  })

  it("lasts a step as long as the sequencer's modulated pace as it lands", () => {
    modulate(
      {
        target: { kind: "sequencer", setting: "pace" },
        cc: 3,
        from: "1bar",
        to: "4th",
      },
      [0, at(127)],
    )
    // a quarter for the first step, a bar for the second, then round again
    expect(stepBeats(play(patch, 6))).toEqual([0, 1, 5, 6])
  })

  it("fits a moved note to the scale the step moves the sequencer to", () => {
    patch.voices[0] = {
      ...patch.voices[0],
      transposeAmt: 1,
      transposeFit: "up",
    }
    modulate(
      {
        target: { kind: "sequencer", setting: "scale" },
        cc: 3,
        from: null,
        to: { tonic: 0, name: "major" },
      },
      [0, at(127)],
    )
    const notes = noteOns(play(patch, 7.9))
    // C moved up to C# fits up to D in C major; step 2 has no scale, so
    // E moves up to F as asked
    expect(notes[0].note).toBe(62)
    expect(notes[4].note).toBe(65)
  })

  it("fits what Transpose moves by the modulated fit", () => {
    patch.scale = {
      tonic: 0,
      name: "major",
      steps: [0, 2, 4, 5, 7, 9, 11],
      fit: "up",
    }
    patch.transposeAmt = 1
    modulate(
      {
        target: { kind: "sequencer", setting: "transposeFit" },
        cc: 3,
        from: "up",
        to: "down",
      },
      [0, at(127)],
    )
    const engine = new Engine(patch)
    engine.setActions({ transpose: true })
    engine.start(0)
    // C transposed to C# fits down, back to C
    expect(noteOns(engine.render(0).events)[0].note).toBe(60)
  })
})

describe("a step's length where the sequencer's pace is modulated", () => {
  let patch: PatchJSON

  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "4th"
    patch.syncVoices = true
    patch.steps[0].notes = [60]
    patch.steps[1].notes = [64]
    patch.voices[0] = { ...patch.voices[0], pace: "4th", length: 1 }
    patch = addEnvelope(
      {
        ...patch,
        modulations: [
          {
            target: { kind: "sequencer", setting: "pace" },
            cc: 3,
            from: "1bar",
            to: "4th",
          },
        ],
      },
      1,
      { cc: 3, channel: 1, points: [{ time: 0, value: 0 }] },
    )
  })

  it("is how long the preview shows it", () => {
    // a note a quarter across a whole bar
    expect(stepNotes(patch, 1).map(({ start }) => start)).toEqual([
      0, 0.25, 0.5, 0.75,
    ])
  })

  it("is how long an export plays it", () => {
    expect(exportBeats(patch, 2)).toBe(10)
    const events = renderSequence(patch, {
      voices: [0],
      ccs: [],
      layout: "combined",
      passes: 2,
    })
    expect(stepBeats(events)).toEqual([0, 1, 5, 6])
    expect(noteOns(events)).toHaveLength(10)
  })
})

describe("actions a step's envelope drives", () => {
  let patch: PatchJSON

  // A step a beat, each a note, played by voice 1 alone, a note a beat.
  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "4th"
    patch.loop = { mode: "custom", end: 3 }
    for (const [step, note] of [60, 62, 64, 65].entries()) {
      patch.steps[step].notes = [note]
    }
    patch.steps[8].notes = [67]
    patch.voices[0] = { ...patch.voices[0], pace: "4th", length: 0.5 }
  })

  const modulate = (
    target: ActionTarget,
    ...onSteps: [step: number, points: EnvelopePointJSON[]][]
  ) => {
    patch = onSteps.reduce<PatchJSON>(
      (next, [step, points]) =>
        addEnvelope(next, step, { cc: 3, channel: 1, points }),
      {
        ...patch,
        modulations: [{ target, cc: 3, from: false, to: true }],
      },
    )
  }
  const at = (value: number) => [{ time: 0, value }]
  const HOLD: ActionTarget = { kind: "action", setting: "hold" }

  it("keeps a step whose envelope has Hold on as it ends", () => {
    modulate(HOLD, [1, at(127)])
    const events = play(patch, 5.9)
    expect(stepBeats(events)).toEqual([0, 1])
    // the voice plays on over the step it keeps
    expect(noteOns(events).map(({ note }) => note)).toEqual([
      60, 62, 62, 62, 62, 62,
    ])
  })

  it("reads Hold as the step ends, not as it lands", () => {
    // on until halfway, then off
    modulate(HOLD, [
      1,
      [
        { time: 0, value: 127 },
        { time: 0.5, value: 0 },
      ],
    ])
    expect(stepBeats(play(patch, 3.9))).toEqual([0, 1, 2, 3])
  })

  it("has the step's envelope, not the button, say whether it holds", () => {
    modulate(HOLD, [0, at(0)])
    const engine = new Engine(patch)
    engine.start(0)
    engine.render(0.1)
    engine.setActions({ hold: true })
    // the first step's envelope lets it go; the button keeps the second
    expect(stepBeats(engine.render(3.9).events)).toEqual([1])
  })

  it("moves on flipped from a step whose envelope has Flip on, and plays the step it lands on", () => {
    modulate({ kind: "action", setting: "flip" }, [0, at(127)])
    const events = play(patch, 2.9)
    // from the first step, position 1 is stored step 8; back unflipped from
    // there, as its button is
    expect(events.filter((event) => event.type === "step")).toMatchObject([
      { position: 0, step: 0 },
      { position: 1, step: 8 },
      { position: 2, step: 2 },
    ])
    expect(noteOns(events).map(({ note }) => note)).toEqual([60, 67, 64])
  })

  it("transposes the notes a step's envelope has Transpose on for, as they start", () => {
    patch.transposeAmt = 12
    patch.voices[0].pace = "8th"
    modulate({ kind: "action", setting: "transpose" }, [
      1,
      [
        { time: 0, value: 0 },
        { time: 0.5, value: 127 },
      ],
    ])
    expect(noteOns(play(patch, 2.4)).map(({ note }) => note)).toEqual([
      60, 60, 62, 74, 64,
    ])
  })

  it("keeps only the voice whose Sync the step's envelope has on to the sequencer's pace", () => {
    // two voices arpeggiating up through a three-note chord, two notes a step
    patch.voices[0] = { ...patch.voices[0], pace: "8th", rule: "up" }
    patch.voices[1] = {
      ...patch.voices[1],
      enabled: true,
      pace: "8th",
      rule: "up",
    }
    for (const step of [0, 1, 2]) {
      patch.steps[step].notes = [60, 64, 67]
    }
    modulate({ kind: "action", setting: "sync", voice: 1 }, [1, at(127)])
    const byVoice = (voice: number) =>
      noteOns(play(patch, 2.9))
        .filter((event) => event.voice === voice)
        .map(({ note }) => note)
    // voice 1 plays two notes every step; voice 2 one on the second step,
    // carrying its arpeggio on from where it was
    expect(byVoice(0)).toEqual([60, 64, 67, 60, 64, 67])
    expect(byVoice(1)).toEqual([60, 64, 67, 60, 64])
  })
})
