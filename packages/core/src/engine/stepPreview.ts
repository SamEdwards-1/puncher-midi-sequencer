import { paceBeats } from "../entities/paces"
import { PatchJSON, StepIndex, VoiceIndex } from "../entities/types"
import { Engine } from "./Engine"
import { EngineEvent } from "./events"
import { playableSteps, stepCount, viewIndex } from "./loopRange"

const BEAT_EPSILON = 1e-9

/**
 * A patch that plays `step` and stays on it: the step sits first, with no
 * jump, and the loop ends there. The voices start together on it, as they
 * would on landing.
 */
export const oneStepPatch = (patch: PatchJSON, step: StepIndex): PatchJSON => ({
  ...patch,
  loop: { mode: "custom", end: 0 },
  steps: patch.steps.map((existing, index) =>
    index === 0
      ? {
          ...patch.steps[step],
          jump: { rule: { kind: "always" }, dest: null, normal: null },
        }
      : existing,
  ),
})

export interface StepNote {
  voice: VoiceIndex
  note: number
  velocity: number
  // the voice's pattern dot that played it; ratchet hits share one
  dot: number
  // from the step's start (0) to its end (1)
  start: number
  end: number
}

export interface StepNotesOptions {
  seed?: number
  accentAmount?: number
}

/** What a step plays, and where each voice's pattern is when it lands. */
export interface StepPreview {
  notes: StepNote[]
  // the dot each voice plays first on the step
  voiceDots: number[]
}

// How far a preview plays the sequence looking for its step, in steps: past
// every step a few times over, for directions that wander.
const SEARCH_PASSES = 4

/**
 * The events of the step window starting at `beat`, as they come from an
 * engine that has played everything before it. Voices play free of the
 * steps, so the notes, and the dots they come from, are the ones the step
 * will hear. A note still sounding at the step's end is cut there.
 */
const notesIn = (
  events: EngineEvent[],
  beat: number,
  length: number,
): StepNote[] => {
  const sounding = new Map<string, Omit<StepNote, "end">>()
  // the dot each voice is on; its notes follow its mark
  const dots = new Map<VoiceIndex, number>()
  const notes: StepNote[] = []
  const at = (time: number) => Math.min(1, (time - beat) / length)
  const close = (key: string, time: number) => {
    const open = sounding.get(key)
    if (open !== undefined) {
      notes.push({ ...open, end: at(time) })
      sounding.delete(key)
    }
  }

  for (const event of events) {
    if (event.type === "dot") {
      dots.set(event.voice, event.dot)
      continue
    }
    if (event.type !== "noteOn" && event.type !== "noteOff") {
      continue
    }
    const key = `${event.voice}:${event.channel}:${event.note}`
    // a note struck again before its off ends where the new one starts
    close(key, event.beat)
    if (event.type === "noteOn") {
      sounding.set(key, {
        voice: event.voice,
        note: event.note,
        velocity: event.velocity,
        dot: dots.get(event.voice) ?? 0,
        start: at(event.beat),
      })
    }
  }
  for (const key of [...sounding.keys()]) {
    close(key, beat + length)
  }
  return notes.sort((a, b) => a.start - b.start || a.note - b.note)
}

/**
 * The step on its own, the voices starting together from their first dots:
 * for a step the sequence never reaches.
 */
const alone = (
  patch: PatchJSON,
  step: StepIndex,
  options: { seed: number; accentAmount?: number },
): StepPreview => {
  const length = paceBeats(patch.pace)
  const engine = new Engine(oneStepPatch(patch, step), options)
  engine.start(0)
  const events = [
    ...engine.render(length - BEAT_EPSILON),
    ...engine.stop(length),
  ]
  return {
    notes: notesIn(events, 0, length),
    voiceDots: patch.voices.map(() => 0),
  }
}

/**
 * What a step plays the first time the sequence reaches it from its start,
 * as its voices play it there: they run on through their patterns at their
 * own paces from step to step, so a step comes in partway through them —
 * or at their first dots, when Sync Voices resets them on every step. Their
 * paces, patterns, rules, ratchets, lengths and offsets all count, and so do
 * the direction, jumps, skips and loop that lead to the step. Chance, the
 * random rules and random directions are rolled with a fixed seed, so the
 * picture holds still while the step is edited. A step the sequence never
 * reaches is shown as it would play on its own.
 */
export const previewStep = (
  patch: PatchJSON,
  step: StepIndex,
  { seed = 1, accentAmount }: StepNotesOptions = {},
): StepPreview => {
  const options = { seed, accentAmount }
  const reachable = playableSteps(patch, false).some(
    (position) => viewIndex(position, patch.size, false) === step,
  )
  if (!reachable) {
    return alone(patch, step, options)
  }

  const length = paceBeats(patch.pace)
  const engine = new Engine(patch, options)
  engine.start(0)
  const searched = SEARCH_PASSES * stepCount(patch.size)
  for (let count = 0; count < searched; count++) {
    const beat = count * length
    const events = engine.render(beat + length - BEAT_EPSILON)
    const landing = events.find((event) => event.type === "step")
    if (landing?.type === "step" && landing.step === step) {
      return {
        notes: notesIn(events, beat, length),
        voiceDots: landing.voiceDots,
      }
    }
  }
  return alone(patch, step, options)
}

/** The notes a step plays when the sequence reaches it: see previewStep. */
export const stepNotes = (
  patch: PatchJSON,
  step: StepIndex,
  options: StepNotesOptions = {},
): StepNote[] => previewStep(patch, step, options).notes

/** A pattern dot: which voice, and where in its pattern. */
export interface VoiceDot {
  voice: VoiceIndex
  dot: number
}

/**
 * Two or more voices sounding the same key at once on a step: the key, from
 * when the first of them starts to when the last of them ends, and the dots
 * that played them.
 */
export interface NoteCollision {
  note: number
  start: number
  end: number
  dots: VoiceDot[]
}

const overlaps = (a: StepNote, b: StepNote) =>
  a.start < b.end && b.start < a.end

/**
 * Where a step's voices collide: the same key sounding from two or more of
 * them at the same time. Notes chain into one collision while each overlaps
 * another voice's — a voice striking its own key again is no collision —
 * and a dot's ratchet hits count once. In time order.
 */
export const noteCollisions = (notes: StepNote[]): NoteCollision[] => {
  const byKey = new Map<number, StepNote[]>()
  for (const note of notes) {
    byKey.set(note.note, [...(byKey.get(note.note) ?? []), note])
  }

  const collisions: NoteCollision[] = []
  for (const [key, sounding] of byKey) {
    // joined wherever two voices overlap, so a collision is each group left
    const group = sounding.map((_, index) => index)
    const root = (index: number): number =>
      group[index] === index ? index : root(group[index])
    sounding.forEach((a, i) => {
      sounding.slice(i + 1).forEach((b, offset) => {
        if (a.voice !== b.voice && overlaps(a, b)) {
          group[root(i + 1 + offset)] = root(i)
        }
      })
    })

    const members = new Map<number, StepNote[]>()
    sounding.forEach((note, index) => {
      const at = root(index)
      members.set(at, [...(members.get(at) ?? []), note])
    })
    for (const together of members.values()) {
      if (together.length < 2) {
        continue
      }
      const dots = new Map<string, VoiceDot>()
      for (const { voice, dot } of together) {
        dots.set(`${voice}:${dot}`, { voice, dot })
      }
      collisions.push({
        note: key,
        start: Math.min(...together.map(({ start }) => start)),
        end: Math.max(...together.map(({ end }) => end)),
        dots: [...dots.values()].sort(
          (a, b) => a.voice - b.voice || a.dot - b.dot,
        ),
      })
    }
  }
  return collisions.sort((a, b) => a.start - b.start || a.note - b.note)
}
