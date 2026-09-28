import {
  addEnvelope,
  clearStep,
  createDefaultJump,
  EnvelopePointJSON,
  JumpJSON,
  loopEndIndex,
  MAX_PACE_BEATS,
  MAX_STEPS,
  modulationForCC,
  NOTES_PER_STEP,
  PatchJSON,
  paceBeats,
  removeEnvelope,
  StepIndex,
  setJump,
  setStepNotes,
  setStepState,
  snapToModulation,
  stepPace,
  updateEnvelope,
} from "@midiseq/core"
import { describeStep, stepHasContent } from "./describe"
import {
  InputError,
  JUMP_RULE_NAMES,
  readBoolean,
  readFields,
  readJumpRule,
  readList,
  readNotes,
  readNumber,
  readShape,
  readStep,
  readStepState,
  SHAPE_NAMES,
  STATE_NAMES,
} from "./input"
import {
  boolean,
  changesAny,
  fieldsOf,
  integer,
  list,
  named,
  number,
  object,
  oneOf,
  present,
  ToolContext,
  tool,
} from "./tool"

const JUMP = object(
  {
    rule: oneOf(
      JUMP_RULE_NAMES,
      "When the jump is taken: always; 1x to 7x take it that many times, then fall through once; 2:2 to 8:8 take it on the last of every 2 to 8 visits; a percentage is a chance; last and not last, when the last jump anywhere was or wasn't taken",
    ),
    destination: integer(
      "The step it jumps to when the rule passes; null for none, so the step always goes to its normal step",
      1,
      MAX_STEPS,
    ),
    normal: integer(
      "The step it goes to when the jump isn't taken; null for the next step in the sequencer's direction",
      1,
      MAX_STEPS,
    ),
    remove: boolean("Takes the step's jump away"),
  },
  [],
  "What to change in the step's jump. Leaving the step, the sequencer goes to the destination when the rule passes, and to the normal step when it doesn't",
)

const POINT = object(
  {
    beat: number(
      "Beats from the step's start. A step lasts step_beats beats (see get_sequence): 4 at a pace of 1bar",
      0,
      MAX_PACE_BEATS,
    ),
    value: integer("The CC's value there", 0, 127),
  },
  ["beat", "value"],
)

const ENVELOPE = object(
  {
    cc: integer(
      "The controller's number: 1 modulation wheel, 7 volume, 10 pan, 11 expression, 74 brightness, and so on",
      0,
      119,
    ),
    channel: integer("The MIDI channel it goes out on; 1 unless given", 1, 16),
    points: list(
      POINT,
      "The envelope's points, replacing any it has. The first point's value holds before it and the last point's after it; two points at one beat make a jump",
    ),
    shape: oneOf(
      SHAPE_NAMES,
      "steps holds each value until the next point, as a knob's messages do; ramps runs in straight lines between points. A new envelope steps unless given",
    ),
    remove: boolean("Takes the step's envelope for this CC and channel away"),
  },
  ["cc"],
)

const STEP = object(
  {
    step: integer("The step's number in the grid, from 1", 1, MAX_STEPS),
    clear: boolean(
      "Empties the step's notes and CC envelopes first, as the step editor's Clear does",
    ),
    notes: {
      type: "array",
      items: { type: "string" },
      description:
        'The step\'s notes, replacing any it has; [] leaves it with none. Each named in scientific pitch — "C4" is middle C, "F#3", "Bb2" — or a MIDI number',
    },
    transpose: integer(
      "Semitones to move the step's notes by, after any notes given",
      -127,
      127,
    ),
    state: oneOf(
      STATE_NAMES,
      "normal plays; a rest is visited but silent, though its envelopes still go out; a skip is never visited",
    ),
    jump: JUMP,
    envelopes: list(
      ENVELOPE,
      "CC envelopes to draw or take away: the step's envelope for each CC and channel",
    ),
  },
  ["step"],
)

const editJump = (
  patch: PatchJSON,
  index: StepIndex,
  value: unknown,
  where: string,
): PatchJSON => {
  const fields = readFields(value, where, fieldsOf(JUMP))
  if (present(fields.remove) && readBoolean(fields.remove, `${where}.remove`)) {
    return setJump(patch, index, createDefaultJump())
  }
  const changes: Partial<JumpJSON> = {}
  if (present(fields.rule)) {
    changes.rule = readJumpRule(fields.rule, `${where}.rule`)
  }
  // null means something here: no destination, or the next step
  if (fields.destination !== undefined) {
    changes.dest =
      fields.destination === null
        ? null
        : readStep(fields.destination, patch, `${where}.destination`)
  }
  if (fields.normal !== undefined) {
    changes.normal =
      fields.normal === null
        ? null
        : readStep(fields.normal, patch, `${where}.normal`)
  }
  if (Object.keys(changes).length === 0) {
    throw new InputError(
      `${where} changes nothing: give its rule, destination or normal, or remove it`,
    )
  }
  return setJump(patch, index, changes)
}

const readPoints = (
  patch: PatchJSON,
  cc: number,
  value: unknown,
  where: string,
): EnvelopePointJSON[] => {
  const points = readList(value, where).map((item, position) => {
    const at = `${where}[${position}]`
    const fields = readFields(item, at, fieldsOf(POINT))
    return {
      time: readNumber(fields.beat, `${at}.beat`, 0, MAX_PACE_BEATS, false),
      value: readNumber(fields.value, `${at}.value`, 0, 127),
    }
  })
  if (points.length === 0) {
    throw new InputError(
      `${where} needs at least one point; to take the envelope away, give remove: true`,
    )
  }
  // Stable, so two points at one beat keep the order that makes their jump.
  // A CC driving a setting lands on the setting's values, as a knob
  // recorded on it does.
  const modulation = modulationForCC(patch, cc)
  return points
    .sort((a, b) => a.time - b.time)
    .map((point) =>
      modulation === undefined
        ? point
        : { ...point, value: snapToModulation(modulation, point.value) },
    )
}

const editEnvelopes = (
  start: PatchJSON,
  index: StepIndex,
  value: unknown,
  where: string,
  warnings: string[],
): PatchJSON => {
  let patch = start
  readList(value, where).forEach((item, position) => {
    const at = `${where}[${position}]`
    const fields = readFields(item, at, fieldsOf(ENVELOPE))
    const cc = readNumber(fields.cc, `${at}.cc`, 0, 119)
    const channel = present(fields.channel)
      ? readNumber(fields.channel, `${at}.channel`, 1, 16)
      : 1
    const envelopes = patch.steps[index].envelopes
    const existing = envelopes.find(
      (envelope) => envelope.cc === cc && envelope.channel === channel,
    )
    const lane = `CC ${cc} on channel ${channel}`

    if (present(fields.remove) && readBoolean(fields.remove, `${at}.remove`)) {
      if (existing === undefined) {
        const has = envelopes
          .map((envelope) => `CC ${envelope.cc} on channel ${envelope.channel}`)
          .join(", ")
        throw new InputError(
          `${at}: step ${index + 1} has no envelope for ${lane} to remove; ${has === "" ? "it has none" : `it has ${has}`}`,
        )
      }
      patch = removeEnvelope(patch, index, existing.id)
      return
    }

    const shape = present(fields.shape)
      ? readShape(fields.shape, `${at}.shape`)
      : undefined
    const points = present(fields.points)
      ? readPoints(patch, cc, fields.points, `${at}.points`)
      : undefined
    if (points === undefined && shape === undefined) {
      throw new InputError(
        `${at} changes nothing: give its points or shape, or remove it`,
      )
    }
    if (existing !== undefined) {
      patch = updateEnvelope(patch, index, existing.id, {
        ...(points !== undefined && { points }),
        ...(shape !== undefined && { shape }),
      })
    } else if (points === undefined) {
      throw new InputError(
        `${at}: step ${index + 1} has no envelope for ${lane} yet, so give its points`,
      )
    } else {
      patch = addEnvelope(patch, index, {
        cc,
        channel,
        points,
        ...(shape !== undefined && { shape }),
      })
    }

    // kept, as the envelope editor keeps them, for a pace that grows
    const beats = paceBeats(stepPace(patch, index))
    if (points?.some((point) => point.time > beats)) {
      warnings.push(
        `Step ${index + 1}'s envelope for ${lane} has points past the step's end at beat ${beats}; they play only if the step gets longer`,
      )
    }
  })
  return patch
}

const editStep = (
  start: PatchJSON,
  value: unknown,
  where: string,
  warnings: string[],
): { patch: PatchJSON; index: StepIndex; clears: boolean } => {
  let patch = start
  const fields = readFields(value, where, fieldsOf(STEP))
  const index = readStep(fields.step, patch, `${where}.step`)
  if (!changesAny(fields, STEP, "step")) {
    throw new InputError(
      `${where} changes nothing: give step ${index + 1}'s notes, transpose, state, jump or envelopes, or clear it`,
    )
  }
  const clears =
    present(fields.clear) && readBoolean(fields.clear, `${where}.clear`)
  if (clears) {
    patch = clearStep(patch, index)
  }
  if (present(fields.notes)) {
    const notes = readNotes(fields.notes, `${where}.notes`)
    const limit = patch.maxNotesPerStep
    if (notes.length > limit) {
      throw new InputError(
        `${where}: a step plays at most ${limit} notes${
          limit < NOTES_PER_STEP
            ? ` while step_notes is ${limit} (set_sequencer can raise it to ${NOTES_PER_STEP})`
            : ", one for each voice"
        }, and ${notes.length} were given`,
      )
    }
    patch = setStepNotes(patch, index, notes)
  }
  if (present(fields.transpose)) {
    const semitones = readNumber(
      fields.transpose,
      `${where}.transpose`,
      -127,
      127,
    )
    const moved = patch.steps[index].notes.map((note) => note + semitones)
    if (moved.some((note) => note < 0 || note > 127)) {
      throw new InputError(
        `${where}.transpose would move step ${index + 1}'s notes past MIDI's range, 0 to 127`,
      )
    }
    patch = setStepNotes(patch, index, moved)
  }
  if (present(fields.state)) {
    patch = setStepState(
      patch,
      index,
      readStepState(fields.state, `${where}.state`),
    )
  }
  if (present(fields.jump)) {
    patch = editJump(patch, index, fields.jump, `${where}.jump`)
  }
  if (present(fields.envelopes)) {
    patch = editEnvelopes(
      patch,
      index,
      fields.envelopes,
      `${where}.envelopes`,
      warnings,
    )
  }
  return { patch, index, clears }
}

/**
 * Notes, states, jumps and envelopes, for as many steps as the agent likes
 * in one go: all of it one undo, or none of it if any can't be done.
 */
export const stepsTool = ({ stores, view, edit }: ToolContext) =>
  tool({
    name: "set_steps",
    title: "Edit steps",
    description:
      "Changes steps in the grid: their notes, state, jump and CC envelopes. List each step by number with only what should change in it; the whole call is one entry in the app's undo history, and nothing changes if any of it can't be done. A step's notes are the chord its voices pick from — at most step_notes of them, 4 unless set lower — or a single note for every voice to share. A CC envelope sends a controller across the step, from points at beats from the step's start, on its own MIDI channel to every output. The first step changed is shown in the step editor. Returns the steps as they now are, with any notes outside the scale, and anything else worth knowing.",
    input: object({ steps: list(STEP, "The steps to change") }, ["steps"]),
    run: (input) => {
      const warnings: string[] = []
      let patch = stores.sequencerStore.patch
      const edited: StepIndex[] = []
      let clears = false
      readList(input.steps, "steps").forEach((entry, position) => {
        const done = editStep(patch, entry, `steps[${position}]`, warnings)
        patch = done.patch
        clears ||= done.clears
        if (!edited.includes(done.index)) {
          edited.push(done.index)
        }
      })
      if (edited.length === 0) {
        throw new InputError("steps lists no steps to change")
      }

      const end = loopEndIndex(patch)
      const unreached = edited.filter(
        (index) =>
          patch.loop.mode === "custom" &&
          index > end &&
          stepHasContent(patch, index),
      )
      if (unreached.length > 0) {
        warnings.push(
          `The loop ends at step ${end + 1}, so the sequence reaches ${named("step", unreached)} only by a jump`,
        )
      }

      // clearing ends a take first, as the step editor's Clear does
      if (clears) {
        stores.recorder.setRecording(false)
      }
      edit(patch)
      view.selectStep(edited[0])
      return {
        steps: edited.map((index) => describeStep(patch, index)),
        ...(warnings.length > 0 && { warnings }),
      }
    },
  })
