import {
  createDefaultPatch,
  createDemoPatch,
  nextModulationCC,
  PatchJSON,
  StepJSON,
  VoiceIndex,
} from "@midiseq/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BUILTIN_OUTPUT } from "../stores/MIDIDeviceStore"
import RootStore from "../stores/RootStore"
import { ManualTicker } from "../test/fakes"
import { soundStatus } from "./describe"
import {
  ModelContext,
  ModelContextTool,
  modelContextOf,
  registerTools,
} from "./modelContext"
import { ToolView } from "./tool"
import { createTools } from "./tools"

let rootStore: RootStore
let tools: ModelContextTool[]
// the selection and the step copied, as the app's atoms would hold them
let view: ToolView & {
  step: number
  voice: VoiceIndex
  audition: boolean
  copied: StepJSON | null
}

const patch = () => rootStore.sequencerStore.patch

// biome-ignore lint/suspicious/noExplicitAny: a tool's result is whatever JSON it returns
const call = async (name: string, input: unknown = {}): Promise<any> => {
  const tool = tools.find((each) => each.name === name)
  if (tool === undefined) {
    throw new Error(`no tool ${name}`)
  }
  return tool.execute(input)
}

const start = (from: PatchJSON = createDemoPatch()) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  rootStore.sequencerStore.patch = from
  view = {
    step: 0,
    voice: 0,
    audition: false,
    selectedStep: () => view.step,
    selectStep: (step) => {
      view.step = step
    },
    selectedVoice: () => view.voice,
    selectVoice: (voice) => {
      view.voice = voice
    },
    auditions: () => view.audition,
    copied: null,
    copiedStep: () => view.copied,
    copyStep: (step) => {
      view.copied = step
    },
  }
  tools = createTools(rootStore, view)
}

beforeEach(() => start())

describe("the tools", () => {
  it("each have a name WebMCP allows, a description and an object schema", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_sequence",
      "set_steps",
      "set_voices",
      "set_sequencer",
      "set_modulations",
      "step_menu",
      "play",
      "stop",
      "set_recording",
      "set_actions",
      "select_step",
      "undo",
      "redo",
      "clear_sequence",
    ])
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
      expect(tool.title).not.toBe("")
      expect(tool.description.length).toBeGreaterThan(40)
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      })
      // what the browser does with it first
      expect(() => JSON.stringify(tool.inputSchema)).not.toThrow()
    }
  })

  it("refuse a field they don't take, saying which they do", async () => {
    expect(await call("set_steps", { step: 3, notes: ["C4"] })).toEqual({
      error: 'The input has no field "step"; it takes steps',
    })
    expect(
      await call("set_steps", { steps: [{ step: 3, note: "C4" }] }),
    ).toEqual({
      error:
        'steps[0] has no field "note"; it takes step, clear, notes, transpose, state, jump, envelopes',
    })
  })

  it("refuse any field where they take none", async () => {
    expect(await call("play", { from: 3 })).toEqual({
      error: 'The input has no field "from"; it takes none',
    })
    expect(rootStore.player.isPlaying).toBe(false)
  })

  it("take their input as JSON text too", async () => {
    await call("set_steps", '{"steps":[{"step":9,"notes":["D4"]}]}')
    expect(patch().steps[8].notes).toEqual([62])
    expect(await call("set_steps", "{steps")).toEqual({
      error: "The input isn't JSON",
    })
  })
})

describe("get_sequence", () => {
  it("reads the sequence as the app shows it, numbered from 1", async () => {
    const sequence = await call("get_sequence")

    expect(sequence.name).toBe("Demo")
    expect(sequence.sequencer).toMatchObject({
      tempo: 120,
      size: 64,
      columns: 8,
      pace: "1bar",
      step_beats: 4,
      direction: "fwd",
      loop: "recorded",
      // up to the last step holding anything
      loop_end: 4,
      step_notes: 4,
      scale: null,
    })
    expect(sequence.detected_scales).toContain("C major")

    // only the steps holding anything, their notes by name, lowest first
    expect(sequence.steps).toEqual([
      {
        step: 1,
        notes: ["A3", "C4", "E4", "G4"],
        state: "normal",
        jump: null,
        envelopes: [],
      },
      {
        step: 2,
        notes: ["F3", "A3", "C4", "E4"],
        state: "normal",
        jump: { rule: "2:2", destination: 4, normal: null },
        envelopes: [],
      },
      expect.objectContaining({ step: 3, notes: ["C3", "E3", "G3", "C4"] }),
      expect.objectContaining({ step: 4, notes: ["G3", "B3", "D4", "G4"] }),
    ])

    expect(sequence.voices[1]).toEqual({
      voice: 2,
      enabled: true,
      pace: "8th",
      length: 80,
      rule: "lowest",
      transpose: -12,
      transpose_fit: "up",
      velocity: 100,
      channel: 2,
      instrument: "Acoustic Grand Piano",
      pattern: "x..xx.x.",
      dots: [],
    })
    // a dot's options only where it has any
    expect(sequence.voices[2]).toMatchObject({
      pattern: "xxxx.",
      dots: [{ dot: 3, probability: 50 }],
    })
    expect(sequence.voices[3].enabled).toBe(false)

    expect(sequence.transport).toMatchObject({
      playing: false,
      step: null,
      recording: false,
      actions: { hold: false, sync: false, flip: false, transpose: false },
      outputs: [],
      sound: expect.stringMatching(/^Nothing is routed/),
    })
    expect(sequence.selected).toEqual({ step: 1, voice: 1 })
    expect(sequence.can_undo).toBe(false)
  })

  it("says it changes nothing, and passes on text it didn't write", () => {
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
  })

  it("marks notes a step won't play and notes outside the scale", async () => {
    start(createDefaultPatch())
    rootStore.sequencerStore.patch = {
      ...patch(),
      maxNotesPerStep: 2,
      scale: {
        tonic: 9,
        name: "minor",
        steps: [0, 2, 3, 5, 7, 8, 10],
        fit: "up",
      },
      steps: patch().steps.map((step, index) =>
        index === 0 ? { ...step, notes: [69, 61, 64] } : step,
      ),
    }
    const [step] = (await call("get_sequence")).steps
    expect(step).toMatchObject({
      notes: ["C#4", "E4", "A4"],
      unplayed_notes: ["A4"],
      outside_scale: ["C#4"],
    })
  })
})

describe("set_steps", () => {
  it("writes notes by name or number, as one undo, showing the first step", async () => {
    const result = await call("set_steps", {
      steps: [
        { step: 5, notes: ["C4", "Eb4", 67] },
        { step: 6, notes: "D3 F#3" },
      ],
    })

    expect(patch().steps[4].notes).toEqual([60, 63, 67])
    expect(patch().steps[5].notes).toEqual([50, 54])
    expect(result.steps).toEqual([
      expect.objectContaining({ step: 5, notes: ["C4", "D#4", "G4"] }),
      expect.objectContaining({ step: 6, notes: ["D3", "F#3"] }),
    ])
    expect(view.step).toBe(4)

    rootStore.history.undo()
    expect(patch().steps[4].notes).toEqual([])
    expect(patch().steps[5].notes).toEqual([])
    expect(rootStore.history.canUndo).toBe(false)
  })

  it("changes nothing when any of it can't be done", async () => {
    const before = patch()
    const result = await call("set_steps", {
      steps: [
        { step: 5, notes: ["C4"] },
        { step: 6, notes: ["C4", "D4", "E4", "F4", "G4"] },
      ],
    })

    expect(result.error).toBe(
      "steps[1]: a step plays at most 4 notes, one for each voice, and 5 were given",
    )
    expect(patch()).toBe(before)
    expect(rootStore.history.canUndo).toBe(false)
  })

  it("says what it won't take", async () => {
    const error = async (step: unknown) =>
      (await call("set_steps", { steps: [step] })).error

    rootStore.sequencerStore.patch = { ...patch(), size: 16 }
    expect(await error({ step: 17, notes: [] })).toBe(
      "steps[0].step must be a whole number from 1 to 16, not 17",
    )
    expect(await error({ step: 2, notes: ["H2"] })).toMatch(
      /^steps\[0\]\.notes\[0\] "H2" isn't a note/,
    )
    expect(await error({ step: 2 })).toMatch(/^steps\[0\] changes nothing/)
    expect(await error({ step: 2, transpose: 100 })).toBe(
      "steps[0].transpose would move step 2's notes past MIDI's range, 0 to 127",
    )
    expect(await error({ step: 2, jump: { rule: "sometimes" } })).toMatch(
      /^steps\[0\]\.jump\.rule can't be "sometimes"; it is one of always, 1x/,
    )
  })

  it("names the limit when step_notes is lower", async () => {
    rootStore.sequencerStore.patch = { ...patch(), maxNotesPerStep: 2 }
    const { error } = await call("set_steps", {
      steps: [{ step: 9, notes: ["C4", "E4", "G4"] }],
    })
    expect(error).toBe(
      "steps[0]: a step plays at most 2 notes while step_notes is 2 (set_sequencer can raise it to 4), and 3 were given",
    )
  })

  it("transposes, rests, skips and clears", async () => {
    await call("set_steps", {
      steps: [
        { step: 1, transpose: 12 },
        { step: 3, state: "rest" },
        { step: 4, clear: true, state: "skip" },
      ],
    })
    expect(patch().steps[0].notes).toEqual([69, 72, 76, 79])
    expect(patch().steps[2].state).toBe("rest")
    expect(patch().steps[3]).toMatchObject({ notes: [], state: "skip" })
  })

  it("takes null as left out", async () => {
    await call("set_steps", {
      steps: [{ step: 1, notes: null, transpose: 1, state: null, jump: null }],
    })
    expect(patch().steps[0].notes).toEqual([58, 61, 65, 68])
    expect(patch().steps[0].state).toBe("normal")
  })

  it("sets a jump, changes part of it, and takes it away", async () => {
    await call("set_steps", {
      steps: [{ step: 5, jump: { rule: "3x", destination: 9 } }],
    })
    expect(patch().steps[4].jump).toEqual({
      rule: { kind: "times", n: 3 },
      dest: 8,
      normal: null,
    })

    const { steps } = await call("set_steps", {
      steps: [{ step: 5, jump: { rule: "Not Last", normal: 2 } }],
    })
    expect(steps[0].jump).toEqual({
      rule: "not last",
      destination: 9,
      normal: 2,
    })

    await call("set_steps", {
      steps: [{ step: 5, jump: { destination: null, normal: null } }],
    })
    expect(patch().steps[4].jump).toMatchObject({ dest: null, normal: null })

    await call("set_steps", { steps: [{ step: 2, jump: { remove: true } }] })
    expect(patch().steps[1].jump).toEqual({
      rule: { kind: "always" },
      dest: null,
      normal: null,
    })
  })

  it("draws an envelope, reshapes it and takes it away", async () => {
    const { steps } = await call("set_steps", {
      steps: [
        {
          step: 1,
          envelopes: [
            {
              cc: 74,
              points: [
                { beat: 2, value: 127 },
                { beat: 0, value: 0 },
              ],
            },
          ],
        },
      ],
    })
    expect(patch().steps[0].envelopes).toEqual([
      {
        id: expect.any(Number),
        cc: 74,
        channel: 1,
        shape: "steps",
        points: [
          { time: 0, value: 0 },
          { time: 2, value: 127 },
        ],
      },
    ])
    expect(steps[0].envelopes).toEqual([
      {
        cc: 74,
        name: "Brightness",
        channel: 1,
        shape: "steps",
        points: [
          { beat: 0, value: 0 },
          { beat: 2, value: 127 },
        ],
      },
    ])

    await call("set_steps", {
      steps: [{ step: 1, envelopes: [{ cc: 74, shape: "ramps" }] }],
    })
    expect(patch().steps[0].envelopes[0]).toMatchObject({
      shape: "ramps",
      points: [
        { time: 0, value: 0 },
        { time: 2, value: 127 },
      ],
    })

    const missing = await call("set_steps", {
      steps: [{ step: 1, envelopes: [{ cc: 74, channel: 2, remove: true }] }],
    })
    expect(missing.error).toBe(
      "steps[0].envelopes[0]: step 1 has no envelope for CC 74 on channel 2 to remove; it has CC 74 on channel 1",
    )

    await call("set_steps", {
      steps: [{ step: 1, envelopes: [{ cc: 74, remove: true }] }],
    })
    expect(patch().steps[0].envelopes).toEqual([])
  })

  it("needs points for a new envelope, and warns of points past the step", async () => {
    expect(
      (
        await call("set_steps", {
          steps: [{ step: 1, envelopes: [{ cc: 1, shape: "ramps" }] }],
        })
      ).error,
    ).toBe(
      "steps[0].envelopes[0]: step 1 has no envelope for CC 1 on channel 1 yet, so give its points",
    )

    const { warnings } = await call("set_steps", {
      steps: [
        { step: 1, envelopes: [{ cc: 1, points: [{ beat: 6, value: 9 }] }] },
      ],
    })
    expect(warnings).toEqual([
      "Step 1's envelope for CC 1 on channel 1 has points past the step's end at beat 4; they play only if the step gets longer",
    ])
  })

  it("puts a modulating CC's points on the setting's values", async () => {
    rootStore.sequencerStore.patch = {
      ...patch(),
      modulations: [
        {
          target: { kind: "voice", voice: 0, setting: "rule" },
          cc: 102,
          from: "nth",
          to: "fall",
        },
      ],
    }
    const { steps } = await call("set_steps", {
      steps: [
        { step: 1, envelopes: [{ cc: 102, points: [{ beat: 0, value: 60 }] }] },
      ],
    })
    // twelve rules across 0 to 127: 60 is nearest the sixth, Down, at 58
    expect(steps[0].envelopes[0]).toMatchObject({
      modulates: "Voice 1 · Rule",
      points: [{ beat: 0, value: 58, stands_for: "Down" }],
    })
  })

  it("warns of a step a custom loop doesn't reach", async () => {
    rootStore.sequencerStore.patch = {
      ...patch(),
      loop: { mode: "custom", end: 7 },
    }
    const { warnings } = await call("set_steps", {
      steps: [
        { step: 12, notes: ["C4"] },
        { step: 14, notes: ["E4"] },
      ],
    })
    expect(warnings).toEqual([
      "The loop ends at step 8, so the sequence reaches steps 12 and 14 only by a jump",
    ])
  })

  it("ends a take before clearing, as the step editor does", async () => {
    rootStore.recorder.setRecording(true)
    await call("set_steps", { steps: [{ step: 2, notes: ["C4"] }] })
    expect(rootStore.recorder.isRecording).toBe(true)
    await call("set_steps", { steps: [{ step: 2, clear: true }] })
    expect(rootStore.recorder.isRecording).toBe(false)
  })
})

describe("set_voices", () => {
  it("changes settings by the names the app shows, and shows the voice", async () => {
    const result = await call("set_voices", {
      voices: [
        {
          voice: 4,
          enabled: true,
          pace: "16th T",
          length: 42,
          rule: "Up / Down +",
          transpose: 7,
          transpose_fit: "exclude",
          velocity: 90,
          instrument: "vibraphone",
        },
      ],
    })

    expect(patch().voices[3]).toMatchObject({
      enabled: true,
      pace: "16thT",
      // on the slider's 5% steps
      length: 0.4,
      rule: "updown+",
      transposeAmt: 7,
      transposeFit: "exclude",
      velocity: 90,
      program: 11,
    })
    expect(result.voices[0]).toMatchObject({
      voice: 4,
      length: 40,
      instrument: "Vibraphone",
    })
    // heard only through the built-in synth, which no output is
    expect(result.warnings).toEqual([
      "Voice 4's instrument is heard only through the built-in synth, which isn't one of its outputs",
    ])
    expect(view.voice).toBe(3)
  })

  it("writes a pattern and dots' options", async () => {
    rootStore.sequencerStore.patch = createDefaultPatch()
    const { voices } = await call("set_voices", {
      voices: [
        {
          voice: 1,
          pattern: "x..x ..x.",
          dots: [
            { dot: 1, accent: "+" },
            { dot: 4, articulation: "tie", ratchet: 3, probability: "75%" },
            { dot: 7, velocity: 50, condition: "not last" },
          ],
        },
      ],
    })

    const voice = patch().voices[0]
    expect(voice.patternLength).toBe(8)
    expect(voice.pattern.slice(0, 8).map((dot) => dot.on)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
    ])
    // the dots past it are kept as they were
    expect(voice.pattern[8].on).toBe(true)
    expect(voices[0]).toMatchObject({
      pattern: "x..x..x.",
      dots: [
        { dot: 1, accent: "+" },
        { dot: 4, articulation: "tie", ratchet: 3, probability: 75 },
        // exactly as given, 14 under the voice's 64
        { dot: 7, velocity: 50, condition: "not last" },
      ],
    })
    expect(voice.pattern[6].velocityOffset).toBe(-14)

    // a velocity landing on an accent is that accent
    await call("set_voices", {
      voices: [{ voice: 1, dots: [{ dot: 7, velocity: 84 }] }],
    })
    expect(patch().voices[0].pattern[6]).toMatchObject({
      accent: "+",
      velocityOffset: 0,
    })

    await call("set_voices", {
      voices: [{ voice: 1, dots: [{ dot: 4, reset: true }] }],
    })
    expect(patch().voices[0].pattern[3]).toEqual({
      on: true,
      articulation: "none",
      accent: "none",
      velocityOffset: 0,
      ratchet: 1,
      probability: 100,
      condition: "always",
    })
  })

  it("moves a channel another voice has on to a free one, and says so", async () => {
    const { voices, warnings } = await call("set_voices", {
      voices: [{ voice: 1, channel: 3 }],
    })
    // 3 and 4 are taken, going up
    expect(voices[0].channel).toBe(5)
    expect(warnings).toEqual([
      "Voice 1 went on to channel 5, as channel 3 is voice 3's and no two voices share one",
    ])

    // and with voice 1 back on 1, nothing is free going down from 2
    start()
    const stays = await call("set_voices", {
      voices: [{ voice: 4, channel: 2 }],
    })
    expect(stays.voices[0].channel).toBe(4)
    expect(stays.warnings).toEqual([
      "Voice 4 stays on channel 4, as channel 2 is voice 2's and no two voices share one",
    ])
  })

  it("warns of a dot past the pattern's end", async () => {
    const { warnings } = await call("set_voices", {
      voices: [{ voice: 2, dots: [{ dot: 12, on: false }] }],
    })
    expect(warnings).toEqual([
      "Voice 2's pattern plays 8 dots, so dot 12 won't play until it is longer",
    ])
  })

  it("is one undo for every voice changed, and makes the first the synced one", async () => {
    await call("set_voices", {
      voices: [
        { voice: 3, rule: "rise" },
        { voice: 1, pace: "4th" },
      ],
    })
    expect(patch().voices[2].rule).toBe("rise")
    expect(patch().voices[0].pace).toBe("4th")
    expect(view.voice).toBe(2)

    rootStore.history.undo()
    expect(patch().voices[2].rule).toBe("random")
    expect(patch().voices[0].pace).toBe("16th")
  })

  it("says what it won't take", async () => {
    const error = async (voice: unknown) =>
      (await call("set_voices", { voices: [voice] })).error

    expect(await error({ voice: 5, enabled: true })).toBe(
      "voices[0].voice must be a whole number from 1 to 4, not 5",
    )
    expect(await error({ voice: 1, pace: "quaver" })).toMatch(
      /^voices\[0\]\.pace can't be "quaver"; it is one of 16bar, 8bar/,
    )
    expect(await error({ voice: 1, pattern: "x-y" })).toMatch(
      /^voices\[0\]\.pattern must be 1 to 16 dots/,
    )
    expect(await error({ voice: 1, instrument: "piano" })).toMatch(
      /^voices\[0\]\.instrument "piano" could be Acoustic Grand Piano, Bright Acoustic Piano/,
    )
    expect(await error({ voice: 1, dots: [{ dot: 2, probability: 60 }] })).toBe(
      "voices[0].dots[0].probability can't be 60; it is one of 100, 90, 75, 67, 50, 33, 25, 10",
    )
    expect(await error({ voice: 2 })).toBe(
      "voices[0] changes nothing: give what to change about voice 2",
    )
  })

  it("takes a General MIDI number from 1", async () => {
    await call("set_voices", { voices: [{ voice: 1, instrument: 33 }] })
    expect(patch().voices[0].program).toBe(32)
  })
})

describe("set_sequencer", () => {
  it("changes the sequencer's settings as one undo", async () => {
    const { sequencer } = await call("set_sequencer", {
      tempo: 96.4,
      pace: "Half D",
      direction: "Fwd / Bwd",
      loop_end: 3,
      sync_voices: true,
      transpose: -5,
      transpose_fit: "down",
      step_notes: 3,
      scale: "a harmonic minor",
      name: "Night drive",
    })

    expect(patch()).toMatchObject({
      tempo: 96,
      pace: "2ndD",
      direction: "fwdbwd",
      loop: { mode: "custom", end: 2 },
      syncVoices: true,
      transposeAmt: -5,
      transposeFit: "down",
      maxNotesPerStep: 3,
      scale: { tonic: 9, name: "harmonicMinor", fit: "up" },
      name: "Night drive",
    })
    expect(sequencer).toMatchObject({
      tempo: 96,
      pace: "2ndD",
      step_beats: 3,
      loop: "custom",
      loop_end: 3,
      scale: "A harmonic minor",
    })

    rootStore.history.undo()
    expect(patch().tempo).toBe(120)
    expect(patch().scale).toBeNull()
  })

  it("takes a scale away, and keeps its fit when changing it", async () => {
    rootStore.sequencerStore.patch = {
      ...patch(),
      scale: {
        tonic: 0,
        name: "major",
        steps: [0, 2, 4, 5, 7, 9, 11],
        fit: "exclude",
      },
    }
    await call("set_sequencer", { scale: "Bb dorian" })
    expect(patch().scale).toMatchObject({
      tonic: 10,
      name: "dorian",
      fit: "exclude",
    })
    await call("set_sequencer", { scale: "none" })
    expect(patch().scale).toBeNull()
  })

  it("warns of notes that stop playing and steps the grid leaves out", async () => {
    const { warnings } = await call("set_sequencer", {
      step_notes: 2,
      size: 2,
    })
    expect(warnings).toEqual([
      "Only the lowest 2 notes of a step play now, so some of steps 1 and 2 won't",
      "The grid ends before steps 3 and 4, which keep what they hold for when it grows",
    ])
  })

  it("says what it won't take", async () => {
    expect((await call("set_sequencer", {})).error).toMatch(
      /^Give at least one setting to change: tempo, size, pace/,
    )
    expect((await call("set_sequencer", { scale: "H minor" })).error).toMatch(
      /^scale can't be "H minor"; give a tonic/,
    )
    expect(
      (await call("set_sequencer", { loop: "all", loop_end: 4 })).error,
    ).toBe('loop_end makes the loop custom, so it can\'t go with loop "all"')
    expect(
      (await call("set_sequencer", { size: 16, loop_end: 20 })).error,
    ).toBe("loop_end must be a whole number from 1 to 16, not 20")
    expect(rootStore.history.canUndo).toBe(false)
  })

  it("leaves no undo for a change that changes nothing", async () => {
    await call("set_sequencer", { tempo: 120 })
    expect(rootStore.history.canUndo).toBe(false)
  })
})

describe("the transport and the actions", () => {
  it("plays and stops, saying why it would be silent", async () => {
    expect(await call("play")).toEqual({
      playing: true,
      tempo: 120,
      sound:
        "Nothing is routed: an output has to be ticked in Settings → MIDI to hear anything",
    })
    expect(rootStore.player.isPlaying).toBe(true)
    expect((await call("play")).note).toBe("It was playing already")

    expect(await call("stop")).toEqual({ playing: false })
    expect(rootStore.player.isPlaying).toBe(false)
  })

  it("holds actions on and picks the voice Sync plays", async () => {
    const result = await call("set_actions", {
      hold: true,
      sync: true,
      sync_voice: 3,
    })
    expect(rootStore.player.actions).toEqual({
      hold: true,
      sync: true,
      flip: false,
      transpose: false,
    })
    expect(view.voice).toBe(2)
    expect(result).toEqual({
      actions: { hold: true, sync: true, flip: false, transpose: false },
      sync_voice: 3,
      note: "The sequence is stopped; the actions change it as it plays",
    })

    await call("set_actions", { hold: false })
    expect(rootStore.player.actions.hold).toBe(false)
    expect((await call("set_actions", {})).error).toMatch(
      /^Give an action to turn on or off/,
    )
  })

  it("selects a step, sounding it as Audition step says", async () => {
    const preview = vi.spyOn(rootStore.player, "previewStep")

    const quiet = await call("select_step", { step: 3 })
    expect(view.step).toBe(2)
    expect(quiet).toMatchObject({
      selected: 3,
      sounded: false,
      plays_next: false,
      step: { step: 3, notes: ["C3", "E3", "G3", "C4"] },
    })
    expect(preview).not.toHaveBeenCalled()
    // stopped, it is where recording goes on from
    expect(rootStore.recorder.target).toBe(2)

    view.audition = true
    const sounded = await call("select_step", { step: 2 })
    expect(preview).toHaveBeenCalledWith(1)
    expect(sounded.sounded).toBe(true)
    expect(sounded.sound).toMatch(/^Nothing is routed/)

    await call("select_step", { step: 4, audition: false })
    expect(preview).toHaveBeenCalledTimes(1)
  })

  it("plays a step selected while playing next, without sounding it", async () => {
    const queue = vi.spyOn(rootStore.player, "queueStep")
    const preview = vi.spyOn(rootStore.player, "previewStep")
    view.audition = true
    await call("play")
    const result = await call("select_step", { step: 4, audition: true })
    expect(queue).toHaveBeenCalledWith(3)
    expect(result.plays_next).toBe(true)
    expect(result.sounded).toBe(false)
    expect(preview).not.toHaveBeenCalled()
    await call("stop")
  })
})

describe("set_modulations", () => {
  it("binds the additional sequencer controls and rejects a voice for them", async () => {
    const result = await call("set_modulations", {
      modulations: [
        { setting: "size", from: 2, to: 16 },
        { setting: "direction", from: "Forwards", to: "Backwards" },
        { setting: "loop", from: "recorded", to: "custom" },
        { setting: "transpose_amt", from: -12, to: 12 },
        { setting: "transpose_fit", from: "up", to: "down" },
        { setting: "step_notes", from: 1, to: 4 },
      ],
    })
    expect(result.error).toBeUndefined()
    expect(patch().modulations.map(({ target }) => target)).toEqual(
      [
        "size",
        "direction",
        "loop",
        "transposeAmt",
        "transposeFit",
        "maxNotesPerStep",
      ].map((setting) => ({ kind: "sequencer", setting })),
    )
    const invalid = await call("set_modulations", {
      modulations: [{ setting: "size", voice: 1 }],
    })
    expect(invalid.error).toContain("give no voice")
  })
  it("binds a voice's setting to a free CC, across all its values", async () => {
    const cc = nextModulationCC(patch())
    const result = await call("set_modulations", {
      modulations: [{ setting: "pace", voice: 2 }],
    })

    expect(result.modulations).toEqual([
      expect.objectContaining({
        setting: "pace",
        voice: 2,
        label: "Voice 2 · Pace",
        cc,
        from: "16bar",
        to: "32ndT",
        steps: [],
      }),
    ])
    // every pace, the first at the CC's 0 and the last at its 127
    const { values } = result.modulations[0]
    expect(values).toHaveLength(20)
    expect(values[0]).toEqual({ value: "16bar", cc: 0 })
    expect(values[19]).toEqual({ value: "32ndT", cc: 127 })
    expect(result.note).toMatch(/^No step has an envelope for Voice 2 · Pace/)
    // shown in the Voices panel, where its gear is
    expect(view.voice).toBe(1)
    expect(patch().modulations).toEqual([
      {
        target: { kind: "voice", voice: 1, setting: "pace" },
        cc,
        from: "16bar",
        to: "32ndT",
      },
    ])

    rootStore.history.undo()
    expect(patch().modulations).toEqual([])
  })

  it("takes a range as the setting's field has it, and moves envelopes with a change", async () => {
    await call("set_modulations", {
      modulations: [
        { setting: "transpose_amt", voice: 1, cc: 20, from: -12, to: "+12" },
      ],
    })
    // +7 is 19 places on from -12, of 25 values across 0 to 127
    const { modulations } = await call("get_sequence")
    expect(modulations[0].values).toHaveLength(25)
    expect(modulations[0].values[19]).toEqual({ value: 7, cc: 101 })

    await call("set_steps", {
      steps: [
        { step: 6, envelopes: [{ cc: 20, points: [{ beat: 0, value: 101 }] }] },
      ],
    })
    const changed = await call("set_modulations", {
      modulations: [{ setting: "transpose_amt", voice: 1, from: 0 }],
    })
    expect(changed.modulations[0]).toMatchObject({
      from: 0,
      to: 12,
      steps: [6],
    })
    expect(changed.note).toBeUndefined()
    // the step still moves voice 1 up 7, which is at 74 of 0 to +12
    expect(
      patch().steps[5].envelopes.find((envelope) => envelope.cc === 20)?.points,
    ).toEqual([{ time: 0, value: 74 }])
  })

  it("tells the sequencer's settings, a voice's Sync and the actions apart", async () => {
    const made = await call("set_modulations", {
      modulations: [
        { setting: "pace", cc: 21 },
        { setting: "scale", cc: 22, from: "A minor", to: "A minor blues" },
        { setting: "sync", voice: 3, cc: 23 },
        { setting: "hold", cc: 24, from: "off", to: "on" },
        { setting: "length", voice: 4, cc: 25, from: "50%", to: 100 },
      ],
    })
    expect(
      made.modulations.map(
        ({
          label,
          from,
          to,
        }: {
          label: string
          from: unknown
          to: unknown
        }) => [label, from, to],
      ),
    ).toEqual([
      ["Sequencer · Pace", "16bar", "32ndT"],
      ["Sequencer · Scale", "A minor", "A minor blues"],
      ["Voice 3 · Sync", false, true],
      ["Actions · Hold", false, true],
      ["Voice 4 · Length", 50, 100],
    ])
    expect(patch().modulations[2].target).toEqual({
      kind: "action",
      setting: "sync",
      voice: 2,
    })
    // one undo for them all
    rootStore.history.undo()
    expect(patch().modulations).toEqual([])
  })

  it("says what it won't take", async () => {
    const refused = async (modulation: object) =>
      (await call("set_modulations", { modulations: [modulation] })).error

    expect(await refused({ setting: "rule" })).toBe(
      "modulations[0]: rule is a voice's, so give the voice, 1 to 4",
    )
    expect(await refused({ setting: "sync" })).toBe(
      "modulations[0]: each voice has a sync of its own, so give the voice",
    )
    expect(await refused({ setting: "hold", voice: 1 })).toBe(
      "modulations[0]: hold is an action for the whole sequence, so give no voice",
    )
    expect(await refused({ setting: "scale", voice: 1 })).toBe(
      "modulations[0]: scale is the sequencer's, so give no voice",
    )
    expect(await refused({ setting: "tempo" })).toMatch(
      /^modulations\[0\]\.setting can't be "tempo"; it is one of pace, length/,
    )
    expect(await refused({ setting: "pace", voice: 1, from: "17th" })).toMatch(
      /^modulations\[0\]\.from can't be "17th"/,
    )
    expect(await refused({ setting: "flip", remove: true })).toBe(
      "modulations[0]: Actions · Flip has no modulation to remove",
    )

    await call("set_modulations", {
      modulations: [{ setting: "scale", cc: 22 }],
    })
    expect(await refused({ setting: "rule", voice: 1, cc: 22 })).toBe(
      "modulations[0]: CC 22 drives Sequencer · Scale already, and a CC drives one setting, so give another cc",
    )
    expect(await refused({ setting: "scale" })).toBe(
      "modulations[0] changes nothing: Sequencer · Scale is modulated already, so give its cc, from or to, or remove it",
    )
    expect(await refused({ setting: "scale", remove: true, cc: 3 })).toBe(
      "modulations[0]: remove takes Sequencer · Scale's modulation away, so give no cc",
    )
    expect(patch().modulations).toHaveLength(1)
  })

  it("removes one, its envelopes staying as plain CCs", async () => {
    await call("set_modulations", {
      modulations: [{ setting: "rule", voice: 1, cc: 102 }],
    })
    await call("set_steps", {
      steps: [
        { step: 6, envelopes: [{ cc: 102, points: [{ beat: 0, value: 60 }] }] },
      ],
    })
    const envelope = structuredClone(patch().steps[5].envelopes[0])

    expect(
      await call("set_modulations", {
        modulations: [{ setting: "rule", voice: 1, remove: true }],
      }),
    ).toEqual({ modulations: [], removed: ["Voice 1 · Rule"] })
    expect(patch().modulations).toEqual([])
    // Its snapped value stays as a plain CC after the rule mapping is removed.
    expect(patch().steps[5].envelopes[0]).toEqual(envelope)
  })

  it("warns that envelopes already on its CC start driving the setting", async () => {
    await call("set_steps", {
      steps: [
        { step: 7, envelopes: [{ cc: 25, points: [{ beat: 0, value: 0 }] }] },
      ],
    })
    const made = await call("set_modulations", {
      modulations: [{ setting: "transpose_fit", voice: 1, cc: 25 }],
    })
    expect(made.warnings).toEqual([
      "Voice 1 · Transpose fit now follows the envelopes for CC 25 that step 7 already had",
    ])
    expect(made.modulations[0]).toMatchObject({
      setting: "transpose_fit",
      from: "up",
      to: "ignore",
      steps: [7],
    })
  })
})

describe("step_menu", () => {
  beforeEach(() => start(createDefaultPatch()))

  it("copies a step, sharing the app's copy, and pastes it as one undo", async () => {
    await call("set_steps", {
      steps: [{ step: 1, notes: "C4 E4 G4", state: "rest" }],
    })

    const copied = await call("step_menu", { step: 1, action: "copy" })
    expect(copied.copied).toMatchObject({
      step: 1,
      notes: ["C4", "E4", "G4"],
      state: "rest",
    })
    expect(view.copied?.notes).toEqual([60, 64, 67])
    // copying changes nothing, so the notes are all there is to undo
    rootStore.history.undo()
    expect(rootStore.history.canUndo).toBe(false)

    // and the copy outlasts the step it came from
    const pasted = await call("step_menu", { step: 5, action: "paste" })
    expect(pasted.pasted).toMatchObject({
      step: 5,
      notes: ["C4", "E4", "G4"],
      state: "rest",
    })
    expect(view.step).toBe(4)

    rootStore.history.undo()
    expect(patch().steps[4].notes).toEqual([])
  })

  it("has nothing to paste before a copy", async () => {
    expect(await call("step_menu", { step: 2, action: "paste" })).toEqual({
      error: "Nothing has been copied to paste: copy a step first",
    })
  })

  it("inserts an empty step, the rest and their jumps moving along", async () => {
    await call("set_steps", {
      steps: [
        { step: 2, notes: ["D4"] },
        { step: 3, notes: ["E4"], jump: { rule: "always", destination: 2 } },
      ],
    })

    expect(
      await call("step_menu", { step: 2, action: "insert_before" }),
    ).toEqual({
      inserted: 2,
      moved: "The steps from 2 on each moved along one",
    })
    expect(
      patch()
        .steps.slice(1, 4)
        .map((step) => step.notes),
    ).toEqual([[], [62], [64]])
    // still to the step with D4 in it
    expect(patch().steps[3].jump.dest).toBe(2)
    expect(view.step).toBe(1)

    await call("step_menu", { step: 4, action: "insert_after" })
    expect(patch().steps[4].notes).toEqual([])
    expect(view.step).toBe(4)
  })

  it("inserts nowhere out of sight, and warns of a step pushed past the grid", async () => {
    await call("set_sequencer", { size: 16 })
    await call("set_steps", { steps: [{ step: 16, notes: ["C5"] }] })

    expect(
      await call("step_menu", { step: 16, action: "insert_after" }),
    ).toEqual({
      error:
        "Step 16 is the grid's last, so there is no room after it to see: insert before it, or give set_sequencer a bigger size first",
    })
    const pushed = await call("step_menu", { step: 1, action: "insert_after" })
    expect(pushed.warnings).toEqual([
      "Step 16 moved to step 17, past the grid's end, where it is kept for when the grid grows",
    ])
    expect(patch().steps[16].notes).toEqual([72])
  })

  it("deletes a step, the rest moving back and jumps to it dropped", async () => {
    await call("set_steps", {
      steps: [
        { step: 2, notes: ["D4"] },
        { step: 3, notes: ["E4"] },
        { step: 5, notes: ["G4"], jump: { rule: "always", destination: 2 } },
      ],
    })

    expect(await call("step_menu", { step: 2, action: "delete" })).toEqual({
      deleted: 2,
      moved:
        "The steps after it each moved back one, and an empty step came in at the end",
      warnings: ["Jumps to step 2 were dropped, from step 5"],
    })
    expect(patch().steps[1].notes).toEqual([64])
    expect(patch().steps[3].jump.dest).toBeNull()

    rootStore.history.undo()
    expect(patch().steps[1].notes).toEqual([62])
  })

  it("clears a step, and ends a take before steps change", async () => {
    await call("set_steps", { steps: [{ step: 1, notes: ["C4"] }] })
    rootStore.recorder.setRecording(true)

    await call("step_menu", { step: 1, action: "copy" })
    expect(rootStore.recorder.isRecording).toBe(true)
    const cleared = await call("step_menu", { step: 1, action: "clear" })
    expect(cleared.cleared).toMatchObject({ step: 1, notes: [] })
    expect(rootStore.recorder.isRecording).toBe(false)
  })

  it("says what it won't take", async () => {
    expect(await call("step_menu", { step: 1, action: "cut" })).toEqual({
      error:
        'action can\'t be "cut"; it is one of copy, paste, insert_before, insert_after, clear, delete',
    })
    // as the menu words it
    await call("step_menu", { step: 1, action: "Insert before" })
    expect(view.step).toBe(0)
  })
})

describe("set_recording", () => {
  it("records a take into the step given, as one undo, and ends it", async () => {
    const before = patch().steps[2].notes

    expect(await call("set_recording", { recording: true, step: 3 })).toEqual({
      recording: true,
      record_step: 3,
      inputs: [],
      warnings: [
        "No MIDI input is ticked and connected in Settings → MIDI, so nothing played can be recorded",
      ],
    })
    expect(view.step).toBe(2)
    expect((await call("get_sequence")).transport).toMatchObject({
      recording: true,
      record_step: 3,
      inputs: [],
    })

    // what the person plays lands there
    rootStore.recorder.onMessage({
      type: "noteOn",
      channel: 1,
      note: 72,
      velocity: 100,
    })
    expect(patch().steps[2].notes).toEqual([72])

    expect(await call("set_recording", { recording: false })).toEqual({
      recording: false,
      record_step: 3,
      inputs: [],
    })
    rootStore.history.undo()
    expect(patch().steps[2].notes).toEqual(before)
  })

  it("moves where recording goes without starting it", async () => {
    expect(await call("set_recording", { step: 5 })).toEqual({
      recording: false,
      record_step: 5,
      inputs: [],
    })
    expect(rootStore.recorder.target).toBe(4)
    expect(rootStore.history.canUndo).toBe(false)
  })

  it("says what it won't take", async () => {
    expect(await call("set_recording", {})).toEqual({
      error:
        "Give recording, true or false, or the step to record into, or both",
    })
    expect(await call("set_recording", { step: 99 })).toEqual({
      error: "step must be a whole number from 1 to 64, not 99",
    })
  })
})

describe("the history", () => {
  it("undoes and redoes, as many times as asked and there are", async () => {
    await call("set_sequencer", { tempo: 100 })
    await call("set_sequencer", { tempo: 110 })

    expect(await call("undo", { times: 5 })).toEqual({
      undone: 2,
      can_undo: false,
      can_redo: true,
    })
    expect(patch().tempo).toBe(120)

    expect(await call("redo")).toEqual({
      redone: 1,
      can_undo: true,
      can_redo: true,
    })
    expect(patch().tempo).toBe(100)
  })

  it("clears the sequence, which Undo brings back", async () => {
    const before = patch()
    await call("clear_sequence")
    expect(patch().steps.every((step) => step.notes.length === 0)).toBe(true)
    expect(patch().voices.map((voice) => voice.enabled)).toEqual([
      true,
      false,
      false,
      false,
    ])
    // how it plays stays
    expect(patch().pace).toBe("1bar")

    await call("undo")
    expect(patch()).toBe(before)
  })
})

describe("why nothing would be heard", () => {
  const outputs = (all: string[], voices: (string | null)[] = []) => ({
    outputNames: {
      all,
      voices: [0, 1, 2, 3].map((index) => voices[index] ?? null),
    },
  })
  const synth = (
    state: "off" | "loading" | "ready" | "error",
    waiting = false,
  ) => ({ state, error: state === "error" ? "no SoundFont" : null, waiting })

  it("is nothing routed, or the built-in synth not started", () => {
    expect(soundStatus(outputs([]), synth("off"))).toMatch(/^Nothing is routed/)
    expect(soundStatus(outputs(["loopMIDI"]), synth("off"))).toBeNull()
    expect(soundStatus(outputs([], ["loopMIDI"]), synth("off"))).toBeNull()
    expect(soundStatus(outputs([BUILTIN_OUTPUT]), synth("loading"))).toBe(
      "The built-in synth is still starting",
    )
    expect(soundStatus(outputs([BUILTIN_OUTPUT]), synth("error"))).toBe(
      "The built-in synth didn't start: no SoundFont",
    )
    // audio starts only from a click or key press on the page
    expect(
      soundStatus(outputs([BUILTIN_OUTPUT]), synth("ready", true)),
    ).toMatch(/^The built-in synth starts with the first click/)
    expect(soundStatus(outputs([BUILTIN_OUTPUT]), synth("ready"))).toBeNull()
  })
})

describe("registering the tools", () => {
  const fakeContext = () => {
    const registered = new Map<string, ModelContextTool>()
    const context: ModelContext = {
      registerTool: vi.fn(
        async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
          if (registered.has(tool.name)) {
            throw new DOMException(tool.name, "InvalidStateError")
          }
          registered.set(tool.name, tool)
          options?.signal?.addEventListener("abort", () =>
            registered.delete(tool.name),
          )
        },
      ),
    }
    return { context, registered }
  }

  it("finds the page's model context where it takes tools", () => {
    const page = (modelContext?: unknown) =>
      ({ modelContext }) as unknown as Document
    const { context } = fakeContext()
    expect(modelContextOf(page(context))).toBe(context)
    expect(modelContextOf(page())).toBeNull()
    // an API from before tools were registered one at a time
    expect(modelContextOf(page({ provideContext: () => {} }))).toBeNull()
  })

  it("registers each tool until the signal is aborted", async () => {
    const { context, registered } = fakeContext()
    const registration = new AbortController()
    await registerTools(context, tools, registration.signal)
    expect([...registered.keys()]).toEqual(tools.map((tool) => tool.name))

    registration.abort()
    expect(registered.size).toBe(0)
  })

  it("goes on past a refusal, and registers nothing once aborted", async () => {
    const { context, registered } = fakeContext()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    registered.set("play", tools[4])

    const registration = new AbortController()
    await registerTools(context, tools, registration.signal)
    expect(warn).toHaveBeenCalledWith(
      "Couldn't offer the play tool to agents",
      expect.any(DOMException),
    )
    expect(registered.size).toBe(tools.length)

    const late = new AbortController()
    late.abort()
    await registerTools(context, tools, late.signal)
    expect(context.registerTool).toHaveBeenCalledTimes(tools.length)
    warn.mockRestore()
  })
})
