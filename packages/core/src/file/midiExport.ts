import { Engine } from "../engine/Engine"
import { EngineEvent } from "../engine/events"
import { playableSteps, stepCount } from "../engine/loopRange"
import { stepEvents } from "../engine/stepPreview"
import { paceBeats } from "../entities/paces"
import { ModSource, PatchJSON, StepIndex, VoiceIndex } from "../entities/types"
import {
  controlChange,
  MIDI_FILE_PPQ,
  MidiFileEvent,
  MidiFileTrack,
  noteOff,
  noteOn,
  programChange,
  writeMidiFile,
} from "./midiFile"

export const MIDI_EXTENSION = ".mid"

/** A controller the sequence sends, told apart by its number and channel. */
export interface ExportCC {
  cc: number
  channel: number
}

/**
 * Each track a voice of its own, or everything — the chosen voices' notes
 * and the chosen CCs — together on one.
 */
export type ExportLayout = "perVoice" | "combined"

export interface MidiExportOptions {
  // the voices whose notes go in
  voices: readonly VoiceIndex[]
  // the controllers that go in, from the steps' envelopes and the mod
  // outputs; with a track per voice they have a track of their own
  ccs: readonly ExportCC[]
  layout: ExportLayout
  // how many times through the sequence
  passes: number
  // chance and the random rules and directions are rolled from this, as a
  // performance is; the same seed gives the same file
  seed?: number
  accentAmount?: number
}

/** A controller the sequence sends, and what sends it. */
export interface SequenceCC extends ExportCC {
  // the steps with an envelope for it
  steps: StepIndex[]
  // the mod outputs sending it
  mods: ModSource[]
}

const ccKey = ({ cc, channel }: ExportCC) => `${channel}:${cc}`

// where the mod outputs send, as the engine sends them
const MOD_CHANNEL = 1

/**
 * Every controller the sequence can send, by channel and then number: the
 * CCs of the steps' envelopes, and of the mod outputs that are on, which
 * send on channel 1 as every step lands. One the steps and a mod output
 * share is listed once. Given `only`, just those steps' envelopes count.
 */
export const sequenceCCs = (
  patch: PatchJSON,
  only?: readonly StepIndex[],
): SequenceCC[] => {
  const found = new Map<string, SequenceCC>()
  const entry = (cc: number, channel: number) => {
    const key = ccKey({ cc, channel })
    const existing =
      found.get(key) ?? ({ cc, channel, steps: [], mods: [] } as SequenceCC)
    found.set(key, existing)
    return existing
  }
  patch.steps.slice(0, stepCount(patch.size)).forEach((step, index) => {
    if (only !== undefined && !only.includes(index)) {
      return
    }
    for (const { cc, channel } of step.envelopes) {
      const each = entry(cc, channel)
      if (!each.steps.includes(index)) {
        each.steps.push(index)
      }
    }
  })
  for (const mod of patch.modOuts) {
    if (mod.enabled) {
      entry(mod.cc, MOD_CHANNEL).mods.push(mod.source)
    }
  }
  return [...found.values()].sort(
    (a, b) => a.channel - b.channel || a.cc - b.cc,
  )
}

/** Steps in one pass through the sequence: those its loop plays. */
export const passSteps = (patch: PatchJSON): number =>
  playableSteps(patch, false).length

/** How long an export runs, in beats. */
export const exportBeats = (patch: PatchJSON, passes: number): number =>
  passes * passSteps(patch) * paceBeats(patch.pace)

// just short of a beat, so a render stops before whatever falls on it
const BEAT_EPSILON = 1e-9

/**
 * Everything the sequence plays over `passes` passes from its start, worked
 * out at once and in silence: the notes and CCs a performance would send,
 * without sending any. A step at a time, since the engine caps what one
 * render returns. Whatever still sounds at the end is released there.
 */
export const renderSequence = (
  patch: PatchJSON,
  { passes, seed = 1, accentAmount }: MidiExportOptions,
): EngineEvent[] => {
  const stepBeats = paceBeats(patch.pace)
  const steps = passes * passSteps(patch)
  const engine = new Engine(patch, { seed, accentAmount })
  engine.start(0)
  const events: EngineEvent[] = []
  for (let step = 1; step <= steps; step++) {
    events.push(...engine.render(step * stepBeats - BEAT_EPSILON))
  }
  events.push(...engine.stop(steps * stepBeats))
  return events
}

const ticks = (beat: number) => beat * MIDI_FILE_PPQ

// A voice's part: its instrument set first, then its notes on its channel.
const voicePart = (
  patch: PatchJSON,
  index: VoiceIndex,
  events: EngineEvent[],
): MidiFileEvent[] => {
  const voice = patch.voices[index]
  return [
    { tick: 0, data: programChange(voice.channel, voice.program) },
    ...events.flatMap((event) =>
      event.type === "noteOn" && event.voice === index
        ? [
            {
              tick: ticks(event.beat),
              data: noteOn(event.channel, event.note, event.velocity),
            },
          ]
        : event.type === "noteOff" && event.voice === index
          ? [
              {
                tick: ticks(event.beat),
                data: noteOff(event.channel, event.note),
              },
            ]
          : [],
    ),
  ]
}

// The chosen controllers, each where the sequence sent it.
const ccPart = (
  ccs: readonly ExportCC[],
  events: EngineEvent[],
): MidiFileEvent[] => {
  const chosen = new Set(ccs.map(ccKey))
  return events.flatMap((event) =>
    event.type === "cc" && chosen.has(ccKey(event))
      ? [
          {
            tick: ticks(event.beat),
            data: controlChange(event.channel, event.cc, event.value),
          },
        ]
      : [],
  )
}

/**
 * Played events as a type 1 MIDI file: the tempo, then the chosen voices,
 * each on a track of its own followed by a track of the chosen CCs, or all
 * of it together on one track named `name`.
 */
const midiFrom = (
  patch: PatchJSON,
  events: EngineEvent[],
  options: Omit<MidiExportOptions, "passes">,
  name: string,
): Uint8Array<ArrayBuffer> => {
  const voices = [...options.voices].sort((a, b) => a - b)
  const ccs = options.ccs.length > 0 ? ccPart(options.ccs, events) : null
  const tracks: MidiFileTrack[] =
    options.layout === "combined"
      ? [
          {
            name,
            events: [
              ...voices.flatMap((index) => voicePart(patch, index, events)),
              ...(ccs ?? []),
            ],
          },
        ]
      : [
          ...voices.map((index) => ({
            name: `Voice ${index + 1}`,
            events: voicePart(patch, index, events),
          })),
          ...(ccs === null ? [] : [{ name: "CCs", events: ccs }]),
        ]
  return writeMidiFile({ ppq: MIDI_FILE_PPQ, bpm: patch.tempo, tracks })
}

const patchName = (patch: PatchJSON) =>
  patch.name === "" ? "Puncher" : patch.name

/** The sequence as a MIDI file, as it plays from its start. */
export const exportMidi = (
  patch: PatchJSON,
  options: MidiExportOptions,
): Uint8Array<ArrayBuffer> =>
  midiFrom(patch, renderSequence(patch, options), options, patchName(patch))

/**
 * One step as a MIDI file: a pass over it as the sequence first reaches it,
 * a step long, as the step editor shows it.
 */
export const exportStepMidi = (
  patch: PatchJSON,
  step: StepIndex,
  options: Omit<MidiExportOptions, "passes">,
): Uint8Array<ArrayBuffer> =>
  midiFrom(
    patch,
    stepEvents(patch, step, options),
    options,
    `${patchName(patch)} step ${step + 1}`,
  )
