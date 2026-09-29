import {
  clearStep,
  deleteStep,
  insertStep,
  MAX_STEPS,
  PatchJSON,
  pasteStep,
  StepIndex,
} from "@midiseq/core"
import { describeStep, stepHasContent } from "./describe"
import {
  InputError,
  readStep,
  readStepAction,
  STEP_ACTION_NAMES,
} from "./input"
import { integer, named, object, oneOf, ToolContext, tool } from "./tool"

const STEP_MENU = object(
  {
    step: integer("The step's number in the grid, from 1", 1, MAX_STEPS),
    action: oneOf(
      STEP_ACTION_NAMES,
      "copy keeps the step — its notes, envelopes, state and jump — to paste; paste puts the step copied last onto this one, in place of what it holds; insert_before and insert_after make room for an empty step before or after it, the steps from there on each moving one along; clear empties its notes and envelopes; delete takes it out, the steps after it each moving one back",
    ),
  },
  ["step", "action"],
)

// the other steps whose jump goes to `index`, and loses it when that goes
const jumpsTo = (patch: PatchJSON, index: StepIndex) =>
  patch.steps.flatMap((step, at) =>
    at !== index && (step.jump.dest === index || step.jump.normal === index)
      ? [at]
      : [],
  )

/**
 * What a right-click on a step in the grid offers, a call an action, as the
 * menu is a click an item: each change one entry in the undo history.
 */
export const stepMenuTool = ({ stores, view, edit }: ToolContext) =>
  tool({
    name: "step_menu",
    title: "Copy, paste, insert or delete a step",
    description:
      "Does what right-clicking a step in the grid offers: copies it, pastes the step copied last onto it, inserts an empty step before or after it, clears it, or deletes it. Inserting and deleting move the steps after it along or back, and jumps and a custom loop's end follow the steps they pointed at; a jump to a deleted step is dropped. Copying shares the app's own copy, so the person can paste what you copied, and you what they did. Each change is one entry in the app's undo history. The step is selected — for an insert, the new empty step. Returns the step as it now is, or where the steps moved.",
    input: STEP_MENU,
    run: (input) => {
      const { sequencerStore, recorder } = stores
      const patch = sequencerStore.patch
      const index = readStep(input.step, patch)
      const action = readStepAction(input.action)
      // a right-click selects the step before its menu opens
      view.selectStep(index)

      switch (action) {
        case "copy":
          view.copyStep(patch.steps[index])
          return { copied: describeStep(patch, index) }
        case "paste": {
          const copied = view.copiedStep()
          if (copied === null) {
            throw new InputError(
              "Nothing has been copied to paste: copy a step first",
            )
          }
          edit(pasteStep(patch, index, copied))
          return { pasted: describeStep(sequencerStore.patch, index) }
        }
        case "clear":
          // a take ends first, as the step editor's Clear ends it
          recorder.setRecording(false)
          edit(clearStep(patch, index))
          return { cleared: describeStep(sequencerStore.patch, index) }
        case "insert_before":
        case "insert_after": {
          const at = action === "insert_before" ? index : index + 1
          // the room would be past the grid's end, out of sight
          if (at >= patch.size) {
            throw new InputError(
              `Step ${index + 1} is the grid's last, so there is no room after it to see: insert before it, or give set_sequencer a bigger size first`,
            )
          }
          const warnings: string[] = []
          const last = patch.steps.length - 1
          if (stepHasContent(patch, last)) {
            warnings.push(
              `Step ${last + 1}, the last a patch keeps, held something and was pushed off the end; undo brings it back`,
            )
          }
          if (patch.size - 1 < last && stepHasContent(patch, patch.size - 1)) {
            warnings.push(
              `Step ${patch.size} moved to step ${patch.size + 1}, past the grid's end, where it is kept for when the grid grows`,
            )
          }
          // steps moving end a take too, since it records into a step by
          // where it is
          recorder.setRecording(false)
          edit(insertStep(patch, at))
          view.selectStep(at)
          return {
            inserted: at + 1,
            moved: `The steps from ${at + 1} on each moved along one`,
            ...(warnings.length > 0 && { warnings }),
          }
        }
        case "delete": {
          const dropped = jumpsTo(patch, index)
          recorder.setRecording(false)
          edit(deleteStep(patch, index))
          return {
            deleted: index + 1,
            moved:
              "The steps after it each moved back one, and an empty step came in at the end",
            ...(dropped.length > 0 && {
              warnings: [
                `Jumps to step ${index + 1} were dropped, from ${named("step", dropped)}`,
              ],
            }),
          }
        }
      }
    },
  })
