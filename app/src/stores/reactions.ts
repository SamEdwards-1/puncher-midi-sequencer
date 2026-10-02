import { reaction } from "mobx"
import type { MIDIInputPort } from "../services/MIDIInput"
import { MIDISink } from "../services/MIDISink"
import { OutputAssignment } from "../services/OutputRouter"
import { BUILTIN_OUTPUT } from "./MIDIDeviceStore"
import type RootStore from "./RootStore"
import { registerUsageReactions } from "./usageReactions"

// Same ports in the same slots, so a hot-plug of an unrelated device doesn't
// disturb playback.
const sameAssignment = (a: OutputAssignment, b: OutputAssignment) =>
  a.all.length === b.all.length &&
  a.all.every((sink, index) => sink === b.all[index]) &&
  a.voices.every((voice, index) => voice === b.voices[index])

/**
 * Wires the stores and services together, and returns what unwires them
 * again: every reaction, the listener on the MIDI input, and what tells
 * analytics of their use.
 */
export const registerReactions = (rootStore: RootStore): (() => void) => {
  const {
    clockFollower,
    midiDeviceStore,
    midiInput,
    player,
    playbackSettings,
    recorder,
    sequencerStore,
    soundFonts,
    synthStore,
  } = rootStore
  const disposers: (() => void)[] = [registerUsageReactions(rootStore)]

  // Outputs are ports, except where the built-in sound was chosen; that slot
  // gets the synth once it has loaded.
  disposers.push(
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
    ),
  )

  /**
   * The built-in sound loads its SoundFont as soon as it is wanted, at
   * startup when it was chosen last time, and again whenever another font is
   * picked. Choosing it is a click, which lets its audio start; at startup,
   * with no click yet, the first click anywhere does.
   */
  disposers.push(
    reaction(
      () => {
        const { outputNames } = midiDeviceStore
        const wanted = [...outputNames.all, ...outputNames.voices].includes(
          BUILTIN_OUTPUT,
        )
        return wanted ? soundFonts.selectedId : null
      },
      (id) => {
        if (id !== null) {
          void synthStore.use(id, soundFonts.bytes)
          synthStore.resume()
        }
      },
      { fireImmediately: true },
    ),
  )

  // Each voice's instrument follows its channel and program, and is set
  // again on each SoundFont loaded.
  disposers.push(
    reaction(
      () => ({
        ready: synthStore.synth,
        font: synthStore.fontId,
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
          a.font === b.font &&
          a.voices.every(
            (voice, index) =>
              voice.channel === b.voices[index].channel &&
              voice.program === b.voices[index].program,
          ),
      },
    ),
  )

  disposers.push(
    reaction(
      () => midiDeviceStore.inputPorts,
      // a Web MIDI input is a wider type than the service needs
      (ports) => midiInput.setPorts(ports as MIDIInputPort[]),
      {
        fireImmediately: true,
        equals: (a, b) =>
          a.length === b.length && a.every((port, index) => port === b[index]),
      },
    ),
  )

  disposers.push(
    reaction(
      () => midiDeviceStore.filter,
      (filter) => midiInput.setFilter(filter),
      { fireImmediately: true },
    ),
  )

  /**
   * Pressing Play ends a take, however it is pressed. Steps recorded while
   * stopped are then heard back without what is played over them being
   * written in. Arming Record once playing still records on top — which is
   * how a knob is recorded as a curve.
   */
  disposers.push(
    reaction(
      () => player.isPlaying,
      (playing) => {
        if (playing) {
          recorder.setRecording(false)
        }
      },
    ),
  )

  disposers.push(
    reaction(
      () => midiDeviceStore.clock.send,
      (send) => player.setSendClock(send),
      { fireImmediately: true },
    ),
  )

  disposers.push(
    reaction(
      () => midiDeviceStore.sendModulationCCs,
      (send) => player.setSendModulationCCs(send),
      { fireImmediately: true },
    ),
  )

  disposers.push(
    reaction(
      () => playbackSettings.accentAmount,
      (amount) => player.setAccentAmount(amount),
      { fireImmediately: true },
    ),
  )

  // what has been heard so far says nothing about a clock just switched on
  disposers.push(
    reaction(
      () => midiDeviceStore.clock.followTempo,
      () => clockFollower.reset(),
    ),
  )

  /**
   * An incoming clock sets the tempo and nothing else: start and stop are
   * ignored, so the transport stays midiseq's own. The tempo lands in the
   * patch, where the field shows it, but only when the number actually
   * changes — a steady clock writes once and then says nothing.
   */
  disposers.push(
    midiInput.on((message) => {
      if (message.type !== "clock" || !midiDeviceStore.clock.followTempo) {
        return
      }
      const tempo = clockFollower.onTick()
      if (tempo !== null && tempo !== sequencerStore.patch.tempo) {
        sequencerStore.patch = { ...sequencerStore.patch, tempo }
      }
    }),
  )

  disposers.push(
    reaction(
      () => sequencerStore.patch,
      (patch) => {
        player.setPatch(patch)
        // any edit means the file on disk is behind
        sequencerStore.isSaved = false
      },
    ),
  )

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
