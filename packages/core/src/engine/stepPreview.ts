import { paceBeats } from "../entities/paces"
import { PatchJSON, StepIndex, VoiceIndex } from "../entities/types"
import { Engine } from "./Engine"

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

/**
 * The notes a step plays in one pass, as its voices play them on landing:
 * their paces, patterns, rules, ratchets, lengths and offsets all count. A
 * note still sounding at the step's end is cut there. Chance and the random
 * rules are rolled with a fixed seed, so the picture holds still while the
 * step is edited.
 */
export const stepNotes = (
  patch: PatchJSON,
  step: StepIndex,
  { seed = 1, accentAmount }: StepNotesOptions = {},
): StepNote[] => {
  const length = paceBeats(patch.pace)
  const engine = new Engine(oneStepPatch(patch, step), { seed, accentAmount })
  engine.start(0)
  const events = [
    ...engine.render(length - BEAT_EPSILON),
    ...engine.stop(length),
  ]

  const sounding = new Map<string, Omit<StepNote, "end">>()
  // the dot each voice is on; its notes follow its mark
  const dots = new Map<VoiceIndex, number>()
  const notes: StepNote[] = []
  const close = (key: string, beat: number) => {
    const open = sounding.get(key)
    if (open !== undefined) {
      notes.push({ ...open, end: Math.min(1, beat / length) })
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
        start: event.beat / length,
      })
    }
  }
  return notes.sort((a, b) => a.start - b.start || a.note - b.note)
}
