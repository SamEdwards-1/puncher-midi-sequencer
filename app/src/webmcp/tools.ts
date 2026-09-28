import { clearPatch, EngineActions, MAX_STEPS, PatchJSON } from "@midiseq/core"
import type RootStore from "../stores/RootStore"
import { describePatch, describeStep, soundStatus } from "./describe"
import {
  InputError,
  readBoolean,
  readNumber,
  readStep,
  readVoice,
} from "./input"
import { ModelContextTool } from "./modelContext"
import { sequencerTool } from "./sequencer"
import { stepsTool } from "./steps"
import {
  boolean,
  integer,
  NO_INPUT,
  object,
  present,
  ToolContext,
  ToolView,
  tool,
} from "./tool"
import { voicesTool } from "./voices"

const ACTIONS = object({
  hold: boolean("Keeps the sequencer on its step while the voices play on"),
  sync: boolean(
    "Plays the synced voice at the sequencer's pace, a note each step",
  ),
  flip: boolean("Swaps the grid's rows and columns, from the next step on"),
  shift: boolean("Transposes new notes by the sequencer's shift amount"),
  sync_voice: integer(
    "The voice Sync plays, which selects it in the Voices panel",
    1,
    4,
  ),
})

const SELECT = object(
  {
    step: integer("The step's number in the grid, from 1", 1, MAX_STEPS),
    audition: boolean(
      "Whether to sound the step as the voices would play it; unless given, as Audition step, above the grid, is set",
    ),
  },
  ["step"],
)

const times = (what: string) =>
  object({
    times: integer(`How many changes to ${what}; 1 unless given`, 1, 50),
  })

/**
 * The sequencer as WebMCP tools: what an agent in the browser can read of
 * it and do with it. They act as the app's own controls do — an edit is an
 * entry in the undo history, and shows at once — and number steps, voices
 * and dots from 1, as the app shows them.
 */
export const createTools = (
  stores: RootStore,
  view: ToolView,
): ModelContextTool[] => {
  const {
    sequencerStore,
    history,
    player,
    recorder,
    midiDeviceStore,
    synthStore,
    playbackSettings,
  } = stores

  // Into the undo history first, as every edit in the app goes; one that
  // changes nothing leaves no entry.
  const edit = (next: PatchJSON) => {
    if (JSON.stringify(next) === JSON.stringify(sequencerStore.patch)) {
      return
    }
    history.push()
    sequencerStore.patch = next
  }
  const context: ToolContext = { stores, view, edit }

  const sound = () => soundStatus(midiDeviceStore, synthStore)

  const transport = () => {
    const { all, voices } = midiDeviceStore.outputNames
    const status = sound()
    return {
      playing: player.isPlaying,
      // the grid position sounding, whose step Flip can swap for another
      step: player.position === null ? null : player.position + 1,
      recording: recorder.isRecording,
      ...(recorder.isRecording && { record_step: recorder.target + 1 }),
      actions: { ...player.actions },
      outputs: all,
      voice_outputs: voices.flatMap((output, index) =>
        output === null ? [] : [{ voice: index + 1, output }],
      ),
      ...(status !== null && { sound: status }),
    }
  }

  return [
    tool({
      name: "get_sequence",
      title: "Read the sequence",
      description:
        "Reads the whole sequence. Call it first, and again whenever you need to see how things stand. The sequencer walks a grid of steps at its own pace. Each step holds up to four notes — a chord for the voices to draw from — and can hold CC envelopes, a state (normal, rest or skip) and a jump to another step. Four voices play whatever step is current, each at its own pace, with its own rhythm pattern of dots and its own rule for which of the step's notes to play, so a single chord step can become an arpeggio, a bass line and a lead at once. Returns the sequencer's settings, the voices (pattern: x plays, . rests; dots: the options of the dots that have any), every step that holds anything, the scales its notes suggest, modulations (settings a CC's envelopes drive), the transport, what is selected, and whether there is anything to undo. Steps, voices and dots are numbered from 1, as the app shows them, and notes are named in scientific pitch, C4 being middle C.",
      input: NO_INPUT,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      run: () => ({
        // the patch's name and its file's are whatever the person, or a
        // file from anywhere, made them
        name: sequencerStore.patch.name,
        file: sequencerStore.fileName,
        unsaved: !sequencerStore.isSaved,
        ...describePatch(sequencerStore.patch, playbackSettings.accentAmount),
        // how far an accent moves a velocity, a setting of this machine
        accent_amount: playbackSettings.accentAmount,
        transport: transport(),
        selected: {
          step: view.selectedStep() + 1,
          voice: view.selectedVoice() + 1,
        },
        can_undo: history.canUndo,
        can_redo: history.canRedo,
      }),
    }),

    stepsTool(context),
    voicesTool(context),
    sequencerTool(context),

    tool({
      name: "play",
      title: "Play",
      description:
        "Starts the sequence playing from its start, to the outputs ticked in Settings → MIDI. Returns what is playing, and why nothing would be heard, if anything is in the way.",
      input: NO_INPUT,
      run: () => {
        const already = player.isPlaying
        player.play()
        const status = sound()
        return {
          playing: true,
          ...(already && { note: "It was playing already" }),
          tempo: sequencerStore.patch.tempo,
          ...(status !== null && { sound: status }),
        }
      },
    }),

    tool({
      name: "stop",
      title: "Stop",
      description: "Stops the sequence, silencing anything still sounding.",
      input: NO_INPUT,
      run: () => {
        player.stop()
        return { playing: false }
      },
    }),

    tool({
      name: "set_actions",
      title: "Hold, Sync, Flip or Shift",
      description:
        "Turns the actions under the grid on or off; they change the sequence as it plays. Each stays as set until set again, as the buttons do with Latch on, and none is saved with the patch or undone. Returns them as they now are.",
      input: ACTIONS,
      run: (input) => {
        const changes: Partial<EngineActions> = {}
        for (const action of ["hold", "sync", "flip", "shift"] as const) {
          if (present(input[action])) {
            changes[action] = readBoolean(input[action], action)
          }
        }
        const voice = present(input.sync_voice)
          ? readVoice(input.sync_voice, "sync_voice")
          : null
        if (voice === null && Object.keys(changes).length === 0) {
          throw new InputError(
            "Give an action to turn on or off — hold, sync, flip or shift — or the sync_voice",
          )
        }
        // Sync plays the voice selected, as a click on its tab selects it
        if (voice !== null) {
          view.selectVoice(voice)
          player.setSelectedVoice(voice)
        }
        player.setActions(changes)
        return {
          actions: { ...player.actions },
          sync_voice: view.selectedVoice() + 1,
          ...(!player.isPlaying && {
            note: "The sequence is stopped; the actions change it as it plays",
          }),
        }
      },
    }),

    tool({
      name: "select_step",
      title: "Select a step",
      description:
        "Selects a step, as clicking it in the grid does: shows it in the step editor, and sounds it as the voices would play it if Audition step is on. While the sequence plays, the sequencer goes to that step next. Returns the step.",
      input: SELECT,
      run: (input) => {
        const patch = sequencerStore.patch
        const index = readStep(input.step, patch)
        const audition = present(input.audition)
          ? readBoolean(input.audition, "audition")
          : view.auditions()
        view.selectStep(index)
        if (audition) {
          player.previewStep(index)
        }
        // while playing, a click queues the step; stopped, it is where a
        // recording goes on from
        const next = player.isPlaying && !recorder.isRecording
        if (next) {
          player.queueStep(index)
        } else {
          recorder.setTarget(index)
        }
        const status = audition ? sound() : null
        return {
          selected: index + 1,
          sounded: audition,
          plays_next: next,
          step: describeStep(patch, index),
          ...(status !== null && { sound: status }),
        }
      },
    }),

    tool({
      name: "undo",
      title: "Undo",
      description:
        "Undoes the latest changes to the sequence — the person's as well as yours — as Edit → Undo does. Returns how many were undone, and whether there is more to undo or redo.",
      input: times("undo"),
      run: (input) => {
        const wanted = present(input.times)
          ? readNumber(input.times, "times", 1, 50)
          : 1
        let undone = 0
        for (; undone < wanted && history.canUndo; undone++) {
          history.undo()
        }
        return {
          undone,
          can_undo: history.canUndo,
          can_redo: history.canRedo,
        }
      },
    }),

    tool({
      name: "redo",
      title: "Redo",
      description:
        "Redoes changes just undone, as Edit → Redo does. Returns how many were redone, and whether there is more to undo or redo.",
      input: times("redo"),
      run: (input) => {
        const wanted = present(input.times)
          ? readNumber(input.times, "times", 1, 50)
          : 1
        let redone = 0
        for (; redone < wanted && history.canRedo; redone++) {
          history.redo()
        }
        return {
          redone,
          can_undo: history.canUndo,
          can_redo: history.canRedo,
        }
      },
    }),

    tool({
      name: "clear_sequence",
      title: "Clear the sequence",
      description:
        "Empties the sequence to start afresh: every step loses its notes, envelopes, jump, and rest or skip, and every voice goes back to its defaults, with only voice 1 playing. The tempo, size, pace, direction and loop stay as they are. It is one entry in the undo history, so Undo brings it all back.",
      input: NO_INPUT,
      run: () => {
        // a take ends first, as for any edit of the whole patch
        recorder.setRecording(false)
        edit(clearPatch(sequencerStore.patch))
        return { cleared: true, can_undo: history.canUndo }
      },
    }),
  ]
}
