import {
  allNotesOffBytes,
  controlChangeBytes,
  EngineEvent,
  NoteOffEvent,
  noteOffBytes,
  noteOnBytes,
  VOICE_COUNT,
} from "@midiseq/core"
import { AllOutDedupe } from "./AllOutDedupe"
import { MIDISink } from "./MIDISink"

export interface OutputAssignment {
  // every port that takes the whole sequence
  all: MIDISink[]
  voices: (MIDISink | null)[]
}

export const emptyAssignment = (): OutputAssignment => ({
  all: [],
  voices: Array.from({ length: VOICE_COUNT }, () => null),
})

const MIDI_CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1)

const sinksOf = (assignment: OutputAssignment): MIDISink[] => [
  ...new Set(
    [...assignment.all, ...assignment.voices].filter(
      (sink): sink is MIDISink => sink !== null,
    ),
  ),
]

const sameSinks = (a: MIDISink[], b: MIDISink[]) =>
  a.length === b.length && a.every((sink, index) => sink === b[index])

// Sends engine events to the chosen outputs: every note goes to its voice's
// port and, de-duplicated, to each port taking the whole sequence. A port
// that is both only gets the whole-sequence stream.
export class OutputRouter {
  private assignment = emptyAssignment()
  private readonly dedupe = new AllOutDedupe()

  setAssignment(next: OutputAssignment, now: number) {
    const previous = this.assignment
    const nextSinks = sinksOf(next)
    for (const sink of sinksOf(previous)) {
      if (!nextSinks.includes(sink)) {
        this.silence(sink, now)
      }
    }
    if (!sameSinks(previous.all, next.all)) {
      for (const sink of previous.all) {
        if (!next.all.includes(sink)) {
          for (const { channel, note } of this.dedupe.heldNotes()) {
            sink.send(noteOffBytes(channel, note), now)
          }
        }
      }
      this.dedupe.reset()
    }
    this.assignment = next
  }

  route(event: EngineEvent, timestamp: number) {
    const { all, voices } = this.assignment
    switch (event.type) {
      case "noteOn": {
        const voiceSink = voices[event.voice]
        if (voiceSink !== null && !all.includes(voiceSink)) {
          voiceSink.send(
            noteOnBytes(event.channel, event.note, event.velocity),
            timestamp,
          )
        }
        if (all.length > 0) {
          const messages = this.dedupe.noteOn(
            event.voice,
            event.channel,
            event.note,
            event.velocity,
            timestamp,
          )
          for (const message of messages) {
            for (const sink of all) {
              sink.send(message, timestamp)
            }
          }
        }
        break
      }
      case "noteOff": {
        const voiceSink = voices[event.voice]
        if (voiceSink !== null && !all.includes(voiceSink)) {
          voiceSink.send(noteOffBytes(event.channel, event.note), timestamp)
        }
        if (all.length > 0) {
          const messages = this.dedupe.noteOff(
            event.voice,
            event.channel,
            event.note,
          )
          for (const message of messages) {
            for (const sink of all) {
              sink.send(message, timestamp)
            }
          }
        }
        break
      }
      case "cc": {
        const bytes = controlChangeBytes(event.channel, event.cc, event.value)
        const sinks =
          event.output === "all"
            ? all
            : [voices[event.output]].filter(
                (sink): sink is MIDISink => sink !== null,
              )
        for (const sink of sinks) {
          sink.send(bytes, timestamp)
        }
        break
      }
      case "step":
        break
    }
  }

  // Silences every assigned port. Messages already queued with a future
  // timestamp can't always be cancelled (not every browser implements
  // MIDIOutput.clear), so the silencing is sent again at `horizon`, after the
  // last message that was scheduled.
  panic(now: number, horizon: number, sounding: NoteOffEvent[] = []) {
    const { all, voices } = this.assignment
    const sinks = sinksOf(this.assignment)
    for (const sink of sinks) {
      try {
        sink.clear?.()
      } catch {
        // clear() is optional in some browsers
      }
    }
    const held = this.dedupe.heldNotes()
    this.dedupe.reset()

    for (const time of [now, horizon]) {
      for (const sink of all) {
        for (const { channel, note } of held) {
          sink.send(noteOffBytes(channel, note), time)
        }
      }
      for (const off of sounding) {
        const offBytes = noteOffBytes(off.channel, off.note)
        for (const sink of all) {
          sink.send(offBytes, time)
        }
        const voiceSink = voices[off.voice]
        if (voiceSink !== null && !all.includes(voiceSink)) {
          voiceSink.send(offBytes, time)
        }
      }
      for (const sink of sinks) {
        for (const channel of MIDI_CHANNELS) {
          sink.send(allNotesOffBytes(channel), time)
        }
      }
    }
  }

  private silence(sink: MIDISink, now: number) {
    for (const channel of MIDI_CHANNELS) {
      sink.send(allNotesOffBytes(channel), now)
    }
  }
}
