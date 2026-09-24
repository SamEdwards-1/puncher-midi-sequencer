import { reaction } from "mobx"
import type { MIDIInputPort } from "../services/MIDIInput"
import { MIDISink } from "../services/MIDISink"
import { OutputAssignment } from "../services/OutputRouter"
import { BUILTIN_OUTPUT } from "./MIDIDeviceStore"
import type RootStore from "./RootStore"

// Same ports in the same slots, so a hot-plug of an unrelated device doesn't
// disturb playback.
const sameAssignment = (a: OutputAssignment, b: OutputAssignment) =>
  a.all.length === b.all.length &&
  a.all.every((sink, index) => sink === b.all[index]) &&
  a.voices.every((voice, index) => voice === b.voices[index])

export const registerReactions = (rootStore: RootStore) => {
  const {
    clockFollower,
    midiDeviceStore,
    midiInput,
    player,
    sequencerStore,
    synthStore,
  } = rootStore

  // Outputs are ports, except where the built-in sound was chosen; that slot
  // gets the synth once it has loaded.
  reaction(
    () => {
      const { assignment, outputNames } = midiDeviceStore
      const sink = (name: string | null, port: MIDISink | null) =>
        name === BUILTIN_OUTPUT ? synthStore.synth : port
      return {
        all: assignment.all
          .map((port, index) => sink(outputNames.all[index], port))
          .filter((out): out is MIDISink => out !== null),
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
      return [...outputNames.all, ...outputNames.voices].includes(
        BUILTIN_OUTPUT,
      )
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
    () => midiDeviceStore.inputPorts,
    // a Web MIDI input is a wider type than the service needs
    (ports) => midiInput.setPorts(ports as MIDIInputPort[]),
    {
      fireImmediately: true,
      equals: (a, b) =>
        a.length === b.length && a.every((port, index) => port === b[index]),
    },
  )

  reaction(
    () => midiDeviceStore.filter,
    (filter) => midiInput.setFilter(filter),
    { fireImmediately: true },
  )

  reaction(
    () => midiDeviceStore.clock.send,
    (send) => player.setSendClock(send),
    { fireImmediately: true },
  )

  // what has been heard so far says nothing about a clock just switched on
  reaction(
    () => midiDeviceStore.clock.followTempo,
    () => clockFollower.reset(),
  )

  /**
   * An incoming clock sets the tempo and nothing else: start and stop are
   * ignored, so the transport stays midiseq's own. The tempo lands in the
   * patch, where the field shows it, but only when the number actually
   * changes — a steady clock writes once and then says nothing.
   */
  midiInput.on((message) => {
    if (message.type !== "clock" || !midiDeviceStore.clock.followTempo) {
      return
    }
    const tempo = clockFollower.onTick()
    if (tempo !== null && tempo !== sequencerStore.patch.tempo) {
      sequencerStore.patch = { ...sequencerStore.patch, tempo }
    }
  })

  reaction(
    () => sequencerStore.patch,
    (patch) => {
      player.setPatch(patch)
      // any edit means the file on disk is behind
      sequencerStore.isSaved = false
    },
  )
}
