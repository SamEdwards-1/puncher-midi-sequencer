import { reaction } from "mobx"
import type { MIDIInputPort } from "../services/MIDIInput"
import { OutputAssignment } from "../services/OutputRouter"
import type RootStore from "./RootStore"

// Same ports in the same slots, so a hot-plug of an unrelated device doesn't
// disturb playback.
const sameAssignment = (a: OutputAssignment, b: OutputAssignment) =>
  a.all === b.all && a.voices.every((voice, index) => voice === b.voices[index])

export const registerReactions = (rootStore: RootStore) => {
  const { midiDeviceStore, midiInput, player, sequencerStore } = rootStore

  reaction(
    () => midiDeviceStore.assignment,
    (assignment) => player.setOutputs(assignment),
    { fireImmediately: true, equals: sameAssignment },
  )

  reaction(
    () => midiDeviceStore.inputPort,
    // a Web MIDI input is a wider type than the service needs
    (port) => midiInput.setPort(port as MIDIInputPort | null),
    { fireImmediately: true },
  )

  reaction(
    () => sequencerStore.patch,
    (patch) => player.setPatch(patch),
  )
}
