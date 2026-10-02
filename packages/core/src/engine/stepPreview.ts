import { stepPace } from "../entities/modulation"
import { paceBeats } from "../entities/paces"
import {
  MAX_STEPS,
  PatchJSON,
  StepIndex,
  StepJSON,
  VoiceIndex,
} from "../entities/types"
import { DEFAULT_ACCENT_AMOUNT } from "../entities/velocity"
import { Engine, renderThrough } from "./Engine"
import { EngineEvent, StepAdvanceEvent } from "./events"
import { hasContent, playableSteps, stepCount, viewIndex } from "./loopRange"

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

// The events of one pass over a step, from `beat`, and where the voices
// were when it landed.
interface StepWindow {
  events: EngineEvent[]
  beat: number
  length: number
  voiceDots: number[]
}

/**
 * The step on its own, the voices starting together from their first dots:
 * for a step the sequence never reaches. Whatever still sounds at its end
 * is released there.
 */
const alone = (
  patch: PatchJSON,
  step: StepIndex,
  options: { seed: number; accentAmount?: number },
): StepWindow => {
  const length = paceBeats(stepPace(patch, step))
  const engine = new Engine(oneStepPatch(patch, step), options)
  engine.start(0)
  return {
    events: [
      ...renderThrough(engine, length - BEAT_EPSILON),
      ...engine.stop(length),
    ],
    beat: 0,
    length,
    voiceDots: patch.voices.map(() => 0),
  }
}

/**
 * The step the first time the sequence reaches it from its start, played on
 * from everything before it, or on its own if it is never reached.
 */
const landing = (
  patch: PatchJSON,
  step: StepIndex,
  { seed = 1, accentAmount }: StepNotesOptions,
): StepWindow => {
  const options = { seed, accentAmount }
  const reachable = playableSteps(patch, false).some(
    (position) => viewIndex(position, patch.size, false) === step,
  )
  const changingRange = patch.modulations.some(
    ({ target }) =>
      target.kind === "sequencer" &&
      (target.setting === "size" || target.setting === "loop"),
  )
  if (!reachable && !changingRange) {
    return alone(patch, step, options)
  }

  const engine = new Engine(patch, options)
  engine.start(0)
  const searched =
    SEARCH_PASSES * (changingRange ? MAX_STEPS : stepCount(patch.size))
  for (let count = 0; count < searched; count++) {
    const window = nextWindow(engine)
    if (window.landed?.step === step) {
      return { ...window, voiceDots: window.landed.voiceDots }
    }
  }
  return alone(patch, step, options)
}

/**
 * The sequencer's next round as `engine` plays it — a step landing, or Hold
 * keeping one round again — and the step it landed, if it landed one.
 * Everything before the round is played out first and left out.
 */
const nextWindow = (
  engine: Engine,
): Omit<StepWindow, "voiceDots"> & { landed: StepAdvanceEvent | null } => {
  const beat = engine.nextStepBeat
  for (const _ of renderThrough(engine, beat - BEAT_EPSILON)) {
    // played out, and left out
  }
  // the landing, which settles how long the round lasts, then the rest
  const events = [...renderThrough(engine, beat)]
  const length = engine.nextStepBeat - beat
  events.push(...renderThrough(engine, beat + length - BEAT_EPSILON))
  const landed = events.find(
    (event): event is StepAdvanceEvent => event.type === "step",
  )
  return { events, beat, length, landed: landed ?? null }
}

/**
 * One round of the sequencer: the step it landed on, or null where Hold kept
 * the step it was on, and the notes it plays there.
 */
export interface StepRound {
  beat: number
  length: number
  step: StepIndex | null
  notes: StepNote[]
}

/**
 * What the sequencer plays on its next round, as an engine playing live will
 * play it: played on `engine`, which is left just before the round after.
 * To know a live engine's next round, play it on an engine made from its
 * snapshot.
 */
export const playRound = (engine: Engine): StepRound => {
  const { events, beat, length, landed } = nextWindow(engine)
  return {
    beat,
    length,
    step: landed?.step ?? null,
    notes: notesIn(events, beat, length),
  }
}

/**
 * What a step plays the first time the sequence reaches it from its start,
 * as its voices play it there: they run on through their patterns at their
 * own paces from step to step, so a step comes in partway through them —
 * or at their first dots, when Sync Voices resets them on every step. Their
 * paces, patterns, rules, ratchets, lengths and transposes all count, and so do
 * the direction, jumps, skips and loop that lead to the step. Chance, the
 * random rules and random directions are rolled with a fixed seed, so the
 * picture holds still while the step is edited. A step the sequence never
 * reaches is shown as it would play on its own.
 */
export const previewStep = (
  patch: PatchJSON,
  step: StepIndex,
  options: StepNotesOptions = {},
): StepPreview => {
  const { events, beat, length, voiceDots } = landing(patch, step, options)
  return { notes: notesIn(events, beat, length), voiceDots }
}

/**
 * The notes and CCs of one pass over a step, as the sequence reaches it (see
 * previewStep), timed from the step's start: its own and nothing else. A
 * note still sounding from the step before is left out, and one still
 * sounding at its end is released there.
 */
export const stepEvents = (
  patch: PatchJSON,
  step: StepIndex,
  options: StepNotesOptions = {},
): EngineEvent[] => {
  const window = landing(patch, step, options)
  const sounding = new Set<string>()
  const events: EngineEvent[] = []
  const key = (event: { voice: VoiceIndex; channel: number; note: number }) =>
    `${event.voice}:${event.channel}:${event.note}`
  for (const event of window.events) {
    const beat = Math.min(window.length, event.beat - window.beat)
    if (event.type === "noteOn") {
      sounding.add(key(event))
      events.push({ ...event, beat })
    } else if (event.type === "noteOff") {
      if (sounding.delete(key(event))) {
        events.push({ ...event, beat })
      }
    } else if (event.type === "cc") {
      events.push({ ...event, beat })
    }
  }
  for (const event of [...events]) {
    if (event.type === "noteOn" && sounding.delete(key(event))) {
      events.push({
        type: "noteOff",
        beat: window.length,
        voice: event.voice,
        note: event.note,
        channel: event.channel,
      })
    }
  }
  return events
}

/** The notes a step plays when the sequence reaches it: see previewStep. */
export const stepNotes = (
  patch: PatchJSON,
  step: StepIndex,
  options: StepNotesOptions = {},
): StepNote[] => previewStep(patch, step, options).notes

// Whether two objects hold the same values, by reference, but for the keys
// in `except`, which are left to the caller.
const sameBut = <T extends object>(a: T, b: T, except: (keyof T)[] = []) =>
  a === b ||
  [...new Set([...Object.keys(a), ...Object.keys(b)] as (keyof T)[])].every(
    (key) => except.includes(key) || a[key] === b[key],
  )

const sameEach = <T>(a: T[], b: T[], same: (x: T, y: T) => boolean) =>
  a === b || (a.length === b.length && a.every((x, i) => same(x, b[i])))

/**
 * Whether every step previews alike in two patches: they differ at most in
 * what no preview hears. That is the name; the tempo, as a preview counts
 * in beats; the mod outs, which send CCs but roll no chances; the voices'
 * programs, which only the built-in sound plays; and the points of any
 * envelope on a CC that drives no setting — though not whether a step has
 * points at all, which a recorded loop reaches to. Everything else is
 * compared by reference, so an edit that rebuilds a part the same is taken
 * as a change. The engine reads what it passes over only to send CCs, so a
 * round played on from anywhere in the sequence (see playRound) plays
 * alike in both patches too.
 */
export const previewsAlike = (a: PatchJSON, b: PatchJSON): boolean => {
  if (!sameBut(a, b, ["name", "tempo", "modOuts", "voices", "steps"])) {
    return false
  }
  // the modulations are the same, so the CCs they read are
  const read = new Set(a.modulations.map(({ cc }) => cc))
  const heard = (step: StepJSON) =>
    step.envelopes.filter(({ cc }) => read.has(cc))
  return (
    sameEach(a.voices, b.voices, (x, y) => sameBut(x, y, ["program"])) &&
    sameEach(
      a.steps,
      b.steps,
      (x, y) =>
        x === y ||
        (sameBut(x, y, ["envelopes"]) &&
          hasContent(x) === hasContent(y) &&
          sameEach(heard(x), heard(y), Object.is)),
    )
  )
}

/**
 * previewStep, keeping what it made, so everything showing a step shares
 * one preview of it: a patch that previews alike (see previewsAlike) has
 * the same one back, the same object, and an edit nothing on the step hears
 * costs nothing. Only the latest few are kept, so patches gone from the
 * page are let go.
 */
export class StepPreviews {
  // how many previews it has had to make, rather than had kept: for
  // reading from the console
  made = 0
  private kept: {
    patch: PatchJSON
    step: StepIndex
    seed: number
    accentAmount: number
    preview: StepPreview
  }[] = []

  constructor(private readonly size = 8) {}

  get(
    patch: PatchJSON,
    step: StepIndex,
    { seed = 1, accentAmount = DEFAULT_ACCENT_AMOUNT }: StepNotesOptions = {},
  ): StepPreview {
    const index = this.kept.findIndex(
      (each) =>
        each.step === step &&
        each.seed === seed &&
        each.accentAmount === accentAmount &&
        previewsAlike(each.patch, patch),
    )
    const preview =
      index === -1
        ? this.make(patch, step, { seed, accentAmount })
        : this.kept.splice(index, 1)[0].preview
    // held with the latest patch, and first, to be found again soonest
    this.kept.unshift({ patch, step, seed, accentAmount, preview })
    this.kept.length = Math.min(this.kept.length, this.size)
    return preview
  }

  private make(
    patch: PatchJSON,
    step: StepIndex,
    options: StepNotesOptions,
  ): StepPreview {
    this.made++
    return previewStep(patch, step, options)
  }
}

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

/**
 * Where a step's voices collide: the same key sounding from two or more of
 * them at the same time. Notes chain into one collision while each overlaps
 * another voice's — a voice striking its own key again is no collision —
 * and a dot's ratchet hits count once. In time order.
 */
export const noteCollisions = (notes: StepNote[]): NoteCollision[] => {
  const byKey = new Map<number, StepNote[]>()
  for (const note of notes) {
    const sounding = byKey.get(note.note)
    if (sounding === undefined) {
      byKey.set(note.note, [note])
    } else {
      sounding.push(note)
    }
  }

  const collisions: NoteCollision[] = []
  for (const [key, sounding] of byKey) {
    // joined wherever two voices overlap, so a collision is each group left
    const group = sounding.map((_, index) => index)
    const root = (index: number): number => {
      let at = index
      while (group[at] !== at) {
        group[at] = group[group[at]]
        at = group[at]
      }
      return at
    }

    // Swept in order of start, and of end among those starting together, so
    // a note that ends as it starts comes before the rest starting with it,
    // and meets only the notes sounding across it. Each voice holds those of
    // its notes still sounding; once another voice's note joins them they
    // are one group, and the one sounding longest stands for them all.
    const order = sounding
      .map((_, index) => index)
      .sort(
        (a, b) =>
          sounding[a].start - sounding[b].start ||
          sounding[a].end - sounding[b].end,
      )
    const held = new Map<VoiceIndex, number[]>()
    for (const index of order) {
      const { voice, start } = sounding[index]
      let own: number[] = []
      for (const [other, those] of held) {
        const still = those.filter((each) => sounding[each].end > start)
        if (other === voice) {
          own = still
          continue
        }
        let longest = -1
        for (const each of still) {
          group[root(each)] = root(index)
          if (longest === -1 || sounding[each].end > sounding[longest].end) {
            longest = each
          }
        }
        if (longest === -1) {
          held.delete(other)
        } else {
          held.set(other, [longest])
        }
      }
      own.push(index)
      held.set(voice, own)
    }

    const members = new Map<number, StepNote[]>()
    sounding.forEach((note, index) => {
      const at = root(index)
      const together = members.get(at)
      if (together === undefined) {
        members.set(at, [note])
      } else {
        together.push(note)
      }
    })
    for (const together of members.values()) {
      if (together.length < 2) {
        continue
      }
      let start = Number.POSITIVE_INFINITY
      let end = Number.NEGATIVE_INFINITY
      const dots = new Map<string, VoiceDot>()
      for (const note of together) {
        start = Math.min(start, note.start)
        end = Math.max(end, note.end)
        dots.set(`${note.voice}:${note.dot}`, {
          voice: note.voice,
          dot: note.dot,
        })
      }
      collisions.push({
        note: key,
        start,
        end,
        dots: [...dots.values()].sort(
          (a, b) => a.voice - b.voice || a.dot - b.dot,
        ),
      })
    }
  }
  return collisions.sort((a, b) => a.start - b.start || a.note - b.note)
}
