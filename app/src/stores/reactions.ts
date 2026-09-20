import { reaction } from "mobx"
import type { MIDIInputPort } from "../services/MIDIInput"
import { OutputAssignment } from "../services/OutputRouter"
import { BUILTIN_OUTPUT } from "./MIDIDeviceStore"
import type RootStore from "./RootStore"

// Same ports in the same slots, so a hot-plug of an unrelated device doesn't
// disturb playback.
const sameAssignment = (a: OutputAssignment, b: OutputAssignment) =>
  a.all === b.all && a.voices.every((voice, index) => voice === b.voices[index])

export const registerReactions = (rootStore: RootStore) => {
  const { midiDeviceStore, midiInput, player, sequencerStore, synthStore } =
    rootStore

  // Outputs are ports, except where the built-in sound was chosen; that slot
  // gets the synth once it has loaded.
  reaction(
    () => {
      const { assignment, outputNames } = midiDeviceStore
      const sink = (name: string | null, port: OutputAssignment["all"]) =>
        name === BUILTIN_OUTPUT ? synthStore.synth : port
      return {
        all: sink(outputNames.all, assignment.all),
        voices: assignment.voices.map((port, index) =>
          sink(outputNames.voices[index], port),
        ),
      }
    },
    (outputs) => player.setOutputs(outputs),
    { fireImmediately: true, equals: sameAssignment },
  )

  // Choosing the built-in sound starts it; the click that chose it counts as
  // the gesture audio needs.
  reaction(
    () => {
      const { outputNames } = midiDeviceStore
      return [outputNames.all, ...outputNames.voices].includes(BUILTIN_OUTPUT)
    },
    (wanted) => {
      if (wanted) {
        void synthStore.enable()
      }
    },
    { fireImmediately: true },
  )

  // Each voice's instrument follows its channel and program.
  reaction(
    () => ({
      ready: synthStore.synth,
      voices: sequencerStore.patch.voices.map((voice) => ({
        channel: voice.channel,
        program: voice.program,
      })),
    }),
    ({ ready, voices }) => {
      for (const { channel, program } of voices) {
        ready?.setProgram(channel, program)
      }
    },
    {
      fireImmediately: true,
      equals: (a, b) =>
        a.ready === b.ready &&
        a.voices.every(
          (voice, index) =>
            voice.channel === b.voices[index].channel &&
            voice.program === b.voices[index].program,
        ),
    },
  )

  reaction(
    () => midiDeviceStore.inputPort,
    // a Web MIDI input is a wider type than the service needs
    (port) => midiInput.setPort(port as MIDIInputPort | null),
    { fireImmediately: true },
  )

  reaction(
    () => sequencerStore.patch,
    (patch) => {
      player.setPatch(patch)
      // any edit means the file on disk is behind
      sequencerStore.isSaved = false
    },
  )
}
