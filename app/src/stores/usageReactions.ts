import { reaction } from "mobx"
import { track } from "../services/analytics"
import { BUILTIN_OUTPUT } from "./MIDIDeviceStore"
import type RootStore from "./RootStore"

// Where the sequence is heard: the built-in synth, MIDI ports, both, or
// nowhere yet.
const outputKind = (names: (string | null)[]) => {
  const chosen = names.filter((name) => name !== null)
  const synth = chosen.includes(BUILTIN_OUTPUT)
  const midi = chosen.some((name) => name !== BUILTIN_OUTPUT)
  return synth && midi ? "both" : synth ? "synth" : midi ? "midi" : "none"
}

/**
 * Tells analytics of what the stores see happen, however it was asked for —
 * a click, a key, an agent's tool: playback and recording starting, MIDI
 * access, and each group of settings shown. Returns what stops it.
 */
export const registerUsageReactions = (rootStore: RootStore): (() => void) => {
  const { midiDeviceStore, player, recorder, settingsTab } = rootStore
  const disposers = [
    reaction(
      () => player.isPlaying,
      (playing) => {
        if (playing) {
          const { all, voices } = midiDeviceStore.outputNames
          track("playback_start", { output: outputKind([...all, ...voices]) })
        }
      },
    ),
    reaction(
      () => recorder.isRecording,
      (recording) => {
        if (recording) {
          track("recording_start")
        }
      },
    ),
    reaction(
      () => midiDeviceStore.hasAccess,
      (access) => {
        if (access) {
          track("midi_access", {
            result: "granted",
            output_count: midiDeviceStore.connectedOutputNames.length - 1,
            input_count: midiDeviceStore.connectedInputNames.length,
          })
        }
      },
    ),
    reaction(
      () => midiDeviceStore.requestError,
      (error) => {
        if (error !== null) {
          track("midi_access", { result: "failed", error_name: error.name })
        }
      },
    ),
    // the group the dialog opens at, then each one turned to
    reaction(
      () => settingsTab.open && settingsTab.tab,
      (tab) => {
        if (tab !== false) {
          track("settings_view", { tab })
        }
      },
    ),
  ]
  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
