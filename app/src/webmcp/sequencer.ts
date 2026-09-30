import {
  MAX_STEPS,
  NOTES_PER_STEP,
  PatchJSON,
  setSequencer,
} from "@midiseq/core"
import { describeSequencer, stepHasContent } from "./describe"
import {
  DIRECTION_NAMES,
  FIT_NAMES,
  InputError,
  LOOP_NAMES,
  PACE_NAMES,
  readBoolean,
  readDirection,
  readFit,
  readLoopMode,
  readNumber,
  readPace,
  readScale,
  readText,
  SCALE_NAMES,
} from "./input"
import {
  boolean,
  FIT_HINT,
  fieldsOf,
  integer,
  named,
  number,
  object,
  oneOf,
  PACE_HINT,
  present,
  ToolContext,
  text,
  tool,
} from "./tool"

const SEQUENCER = object({
  tempo: number("Beats per minute", 20, 400),
  size: integer(
    "How many steps the grid has, laid out as near square as they allow. Steps past it keep what they hold, for when it grows",
    1,
    MAX_STEPS,
  ),
  pace: oneOf(PACE_NAMES, `How long each step lasts. ${PACE_HINT}`),
  direction: oneOf(
    DIRECTION_NAMES,
    "Which way the sequencer moves: fwd forwards; bwd backwards; fwdbwd and bwdfwd back and forth, starting either way; random to any step; random+ to any step but the one it is on",
  ),
  loop: oneOf(
    LOOP_NAMES,
    "The steps it loops over: up to the last step holding anything (recorded), every step (all), or up to loop_end (custom)",
  ),
  loop_end: integer(
    "The last step of a custom loop; giving it makes the loop custom",
    1,
    MAX_STEPS,
  ),
  sync_voices: boolean(
    "Whether every voice starts its pattern afresh on each step, rather than running on through it from step to step",
  ),
  transpose: integer(
    "Semitones the Transpose action transposes new notes by",
    -24,
    24,
  ),
  transpose_fit: oneOf(FIT_NAMES, FIT_HINT),
  step_notes: integer(
    "How many of each step's notes play, lowest first",
    1,
    NOTES_PER_STEP,
  ),
  scale: text(
    `The scale the patch is in, as its tonic and name — "A minor", "F# dorian" — or "none". The names are ${SCALE_NAMES.join(", ")}. Notes outside it are only marked, never changed`,
  ),
  name: text("The patch's name"),
})

// What the settings given change, read as the Sequencer panel's fields.
const readChanges = (
  input: Record<string, unknown>,
  before: PatchJSON,
): Partial<PatchJSON> => {
  const changes: Partial<PatchJSON> = {}
  if (present(input.tempo)) {
    // whole beats a minute, as the tempo field takes them
    changes.tempo = Math.round(readNumber(input.tempo, "tempo", 20, 400, false))
  }
  if (present(input.size)) {
    changes.size = readNumber(input.size, "size", 1, MAX_STEPS)
  }
  if (present(input.pace)) {
    changes.pace = readPace(input.pace)
  }
  if (present(input.direction)) {
    changes.direction = readDirection(input.direction)
  }
  if (present(input.loop) || present(input.loop_end)) {
    const mode = present(input.loop) ? readLoopMode(input.loop) : "custom"
    if (present(input.loop_end) && mode !== "custom") {
      throw new InputError(
        `loop_end makes the loop custom, so it can't go with loop "${mode}"`,
      )
    }
    changes.loop = {
      mode,
      end: present(input.loop_end)
        ? readNumber(
            input.loop_end,
            "loop_end",
            1,
            changes.size ?? before.size,
          ) - 1
        : before.loop.end,
    }
  }
  if (present(input.sync_voices)) {
    changes.syncVoices = readBoolean(input.sync_voices, "sync_voices")
  }
  if (present(input.transpose)) {
    changes.transposeAmt = readNumber(input.transpose, "transpose", -24, 24)
  }
  if (present(input.transpose_fit)) {
    changes.transposeFit = readFit(input.transpose_fit, "transpose_fit")
  }
  if (present(input.step_notes)) {
    changes.maxNotesPerStep = readNumber(
      input.step_notes,
      "step_notes",
      1,
      NOTES_PER_STEP,
    )
  }
  if (present(input.name)) {
    changes.name = readText(input.name, "name", 200)
  }
  if (present(input.scale)) {
    // its fit, for notes recorded or imported, stays as it was
    changes.scale = readScale(input.scale, before.scale?.fit ?? "up")
  }
  return changes
}

/** The Sequencer panel's settings, and the tempo, as one undo. */
export const sequencerTool = ({ stores, edit }: ToolContext) =>
  tool({
    name: "set_sequencer",
    title: "Change the sequencer's settings",
    description:
      "Changes the sequencer's settings: the tempo, how many steps the grid has, how long each step lasts, which way the sequencer moves, which steps it loops over, the scale, and the rest of the Sequencer panel. Give only what should change; the whole call is one entry in the app's undo history. Returns the settings as they now are.",
    input: SEQUENCER,
    run: (input) => {
      if (!fieldsOf(SEQUENCER).some((field) => present(input[field]))) {
        throw new InputError(
          `Give at least one setting to change: ${fieldsOf(SEQUENCER).join(", ")}`,
        )
      }
      const before = stores.sequencerStore.patch
      const changes = readChanges(input, before)
      const patch = setSequencer(before, changes)

      const warnings: string[] = []
      const crowded = patch.steps.flatMap((step, index) =>
        index < patch.size && step.notes.length > patch.maxNotesPerStep
          ? [index]
          : [],
      )
      if (changes.maxNotesPerStep !== undefined && crowded.length > 0) {
        warnings.push(
          `Only the lowest ${patch.maxNotesPerStep} notes of a step play now, so some of ${named("step", crowded)} won't`,
        )
      }
      const hidden = patch.steps.flatMap((_, index) =>
        index >= patch.size &&
        index < before.size &&
        stepHasContent(patch, index)
          ? [index]
          : [],
      )
      if (hidden.length > 0) {
        warnings.push(
          `The grid ends before ${named("step", hidden)}, which keep what they hold for when it grows`,
        )
      }

      edit(patch)
      return {
        sequencer: describeSequencer(patch),
        ...(warnings.length > 0 && { warnings }),
      }
    },
  })
