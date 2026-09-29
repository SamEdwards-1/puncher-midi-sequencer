import { MAX_STEPS } from "@midiseq/core"
import { portName } from "../stores/MIDIDeviceStore"
import { InputError, readBoolean, readStep } from "./input"
import { boolean, integer, object, present, ToolContext, tool } from "./tool"

const RECORDING = object({
  recording: boolean(
    "true starts a take, as the Record button does; false ends it",
  ),
  step: integer(
    "The step recording goes into next, from 1. It moves on by itself as each step fills",
    1,
    MAX_STEPS,
  ),
})

/**
 * Recording what the person plays, as the Record button and a click on the
 * grid have it: an agent can't play into it, but can have it ready and
 * waiting where the notes should go.
 */
export const recordingTool = ({ stores, view }: ToolContext) =>
  tool({
    name: "set_recording",
    title: "Record from the MIDI input",
    description:
      "Starts or ends recording, as the Record button does, and sets the step it records into. Recording writes what the person plays on the MIDI input into the grid, so use it when they want to play something in; you can't play into it yourself, but set_steps writes notes directly. Notes land on the record step, fitted to the scale — the first of a take replacing what the step held — and once it holds step_notes of them, recording moves on to the next step. A knob or fader records into the step's envelope for its CC; while the sequence plays, where it is heard. A take is one entry in the app's undo history. Returns whether it is recording, the step it records into next, and the MIDI inputs it listens to.",
    input: RECORDING,
    run: (input) => {
      const { sequencerStore, recorder, midiDeviceStore } = stores
      if (!present(input.recording) && !present(input.step)) {
        throw new InputError(
          "Give recording, true or false, or the step to record into, or both",
        )
      }
      const step = present(input.step)
        ? readStep(input.step, sequencerStore.patch)
        : null
      const recording = present(input.recording)
        ? readBoolean(input.recording, "recording")
        : null
      if (step !== null) {
        // as a click on the grid picks where recording goes, and shows it
        recorder.setTarget(step)
        view.selectStep(step)
      }
      if (recording !== null) {
        recorder.setRecording(recording)
      }
      const inputs = midiDeviceStore.inputPorts.map(portName)
      return {
        recording: recorder.isRecording,
        record_step: recorder.target + 1,
        inputs,
        ...(recorder.isRecording &&
          inputs.length === 0 && {
            warnings: [
              "No MIDI input is ticked and connected in Settings → MIDI, so nothing played can be recorded",
            ],
          }),
      }
    },
  })
