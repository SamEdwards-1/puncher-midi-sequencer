import { beforeEach, describe, expect, it } from "vitest"
import { addEnvelope } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import { EnvelopePointJSON, ModulationJSON, PatchJSON } from "../entities/types"
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
  return engine.render(toBeat)
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
        target: { kind: "voice", voice: 0, setting: "offset" },
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

  it("sends the envelope out as its CC, as any step's is", () => {
    modulate(
      {
        target: { kind: "voice", voice: 0, setting: "offset" },
        cc: 3,
        from: 0,
        to: 12,
      },
      [0, at(127)],
    )
    expect(play(patch, 0).filter((event) => event.type === "cc")).toMatchObject(
      [{ cc: 3, value: 127, channel: 1 }],
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
    patch.voices[0] = { ...patch.voices[0], offset: 1, offsetFit: "up" }
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

  it("fits the shift by the modulated fit", () => {
    patch.scale = {
      tonic: 0,
      name: "major",
      steps: [0, 2, 4, 5, 7, 9, 11],
      fit: "up",
    }
    patch.shiftAmt = 1
    modulate(
      {
        target: { kind: "sequencer", setting: "shiftFit" },
        cc: 3,
        from: "up",
        to: "down",
      },
      [0, at(127)],
    )
    const engine = new Engine(patch)
    engine.setActions({ shift: true })
    engine.start(0)
    // C shifted to C# fits down, back to C
    expect(noteOns(engine.render(0))[0].note).toBe(60)
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
