import {
  addEnvelope,
  dropRepeats,
  ENVELOPE_RESOLUTION,
  EnvelopePointJSON,
  EnvelopeShape,
  envelopeShape,
  isControlPosition,
  nextEnvelopeId,
  paceBeats,
  paintPoints,
  StepIndex,
  simplifyPoints,
  stepCount,
  toBeatTimes,
  toStepTimes,
  updateEnvelope,
} from "@midiseq/core"
import { makeObservable, observable } from "mobx"
import { SequencerStore } from "../stores/SequencerStore"
import { MIDICCMessage, MIDIInput, MIDIInputMessage } from "./MIDIInput"
import type { StepProgress } from "./SequencerPlayer"

/**
 * A knob being turned while the sequence plays: which envelope it is
 * writing and how long its step is, what that envelope held before the knob
 * moved, where on the step the movement began, and the values played so
 * far, one per grid slot. Times here are fractions of the step; the
 * envelope keeps beats.
 */
interface CCPass {
  step: StepIndex
  id: number
  shape: EnvelopeShape
  lengthBeats: number
  before: EnvelopePointJSON[]
  from: number
  slots: Map<number, number>
}

/**
 * A knob being turned while stopped: which envelope it is writing, and every
 * value it has sent this take, in order.
 */
interface CCCollection {
  step: StepIndex
  id: number
  shape: EnvelopeShape
  values: number[]
}

/** The envelope a controller was last recorded into. */
export interface RecordedLane {
  step: StepIndex
  id: number
  cc: number
  channel: number
}

/**
 * Records what is played on the MIDI input into the step grid.
 *
 * Notes: a step fills to Step Notes before the target moves on — so notes
 * land as they are played, whether they arrive as a chord or one at a time,
 * and whatever won't fit starts the next step rather than being lost.
 *
 * Controllers go into the step's envelope for that CC and channel, made if
 * the step has none. While the sequence plays, a knob writes where it is
 * heard: on the step sounding, at the moment it moved, replacing the curve
 * from there to the step's end — a MIDI knob has no "let go", so the last
 * value holds, as latched automation does.
 *
 * Stopped, there is no playhead to place a value against, so a knob records
 * the way notes do: into the record target, in the order played. Every value
 * this take has sent is spread evenly across the step, so a sweep becomes a
 * ramp over it whatever the pace, and one value alone is the value the step
 * lands on.
 */
export class MIDIRecorder {
  isRecording = false
  target = 0
  // A new object only when a controller starts writing a different
  // envelope, so the editor can open it once rather than on every value.
  recordedLane: RecordedLane | null = null

  // What this take has put on the target step, in the order played. Null
  // until the first note, which replaces whatever the step already held.
  private written: number[] | null = null
  // one per controller and channel being turned, while playing
  private passes = new Map<string, CCPass>()
  // and while stopped
  private collections = new Map<string, CCCollection>()

  constructor(
    private readonly sequencerStore: SequencerStore,
    input: MIDIInput,
    // called once when a take starts, so the take is one undo entry
    private readonly beforeTake: () => void = () => {},
    // where the sequence is, or null when stopped
    private readonly progress: () => StepProgress | null = () => null,
  ) {
    makeObservable(this, {
      isRecording: observable,
      target: observable,
      recordedLane: observable.ref,
    })
    input.on(this.onMessage)
  }

  setRecording = (recording: boolean) => {
    if (recording === this.isRecording) {
      return
    }
    if (recording) {
      this.beforeTake()
    }
    this.written = null
    this.passes.clear()
    this.collections.clear()
    this.isRecording = recording
  }

  toggleRecording = () => {
    this.setRecording(!this.isRecording)
  }

  setTarget = (step: number) => {
    this.target = step
    // a step picked by hand starts fresh
    this.written = null
  }

  onMessage = (message: MIDIInputMessage) => {
    if (!this.isRecording) {
      return
    }
    if (message.type === "noteOn") {
      this.record(message.note)
    } else if (message.type === "cc") {
      this.recordCC(message)
    }
  }

  private record(note: number) {
    // A step keeps each pitch once, so playing one it already has adds
    // nothing and leaves the step waiting for the rest of its notes.
    if (this.written?.includes(note) === true) {
      return
    }

    const notes = [...(this.written ?? []), note]
    this.written = notes
    this.write(notes)

    if (notes.length >= this.sequencerStore.patch.maxNotesPerStep) {
      this.advance()
    }
  }

  private write(notes: number[]) {
    const patch = this.sequencerStore.patch
    const sorted = [...notes].sort((a, b) => a - b)
    const target = this.target
    this.sequencerStore.patch = {
      ...patch,
      steps: patch.steps.map((step, index) =>
        index === target ? { ...step, notes: sorted, state: "normal" } : step,
      ),
    }
  }

  private advance() {
    const size = this.sequencerStore.patch.size
    this.target = (this.target + 1) % stepCount(size)
    this.written = null
  }

  private recordCC({ cc, channel, value }: MIDICCMessage) {
    // commands and protocol, not a knob's position: nothing to draw
    if (!isControlPosition(cc)) {
      return
    }
    const key = `${cc}/${channel}`
    const progress = this.progress()
    if (progress === null) {
      this.collectCC(key, cc, channel, value)
      return
    }

    const slot = onReadGrid(progress.time, progress.lengthBeats)
    let pass = this.passes.get(key)
    // a knob turned on a new step starts over there
    if (pass === undefined || pass.step !== progress.step) {
      const id = this.envelopeFor(progress.step, cc, channel)
      const envelope = this.sequencerStore.patch.steps[
        progress.step
      ].envelopes.find((current) => current.id === id)
      pass = {
        step: progress.step,
        id,
        shape: envelope === undefined ? "steps" : envelopeShape(envelope),
        lengthBeats: progress.lengthBeats,
        before: toStepTimes(envelope?.points ?? [], progress.lengthBeats),
        from: slot,
        slots: new Map(),
      }
      this.passes.set(key, pass)
    }
    pass.slots.set(slot, value)

    const played = [...pass.slots]
      .sort(([a], [b]) => a - b)
      .map(([time, value]) => ({ time, value }))
    // stepped, as the knob sent it: a point wherever the value changed
    const stroke =
      pass.shape === "steps"
        ? dropRepeats(played)
        : simplifyPoints(played, RECORDED_TOLERANCE)
    // to the step's end: the last value holds until the knob moves again
    this.setPoints(
      pass.step,
      pass.id,
      toBeatTimes(
        paintPoints(pass.before, pass.from, 1, stroke, pass.shape),
        pass.lengthBeats,
      ),
    )
  }

  // Stopped: every value this take has sent to the target, spread across it.
  private collectCC(key: string, cc: number, channel: number, value: number) {
    const step = this.target
    let collection = this.collections.get(key)
    // a new target starts over there, and the first value of a take replaces
    // whatever the step held, as the first note does
    if (collection === undefined || collection.step !== step) {
      const id = this.envelopeFor(step, cc, channel)
      const envelope = this.sequencerStore.patch.steps[step].envelopes.find(
        (each) => each.id === id,
      )
      collection = {
        step,
        id,
        shape: envelope === undefined ? "steps" : envelopeShape(envelope),
        values: [],
      }
      this.collections.set(key, collection)
    }
    collection.values.push(value)

    const { values, shape } = collection
    const last = values.length - 1
    // Stepped, each value holds an even share of the step; ramped, the
    // first is at its start and the last at its end.
    const spread = values.map((each, index) => ({
      time:
        shape === "steps"
          ? index / values.length
          : last === 0
            ? 0
            : index / last,
      value: each,
    }))
    // across the step at the pace it has now, which it then keeps
    this.setPoints(
      step,
      collection.id,
      toBeatTimes(
        shape === "steps"
          ? dropRepeats(spread)
          : simplifyPoints(spread, RECORDED_TOLERANCE),
        paceBeats(this.sequencerStore.patch.pace),
      ),
    )
  }

  // The step's envelope for this controller and channel, made if it has none.
  private envelopeFor(step: StepIndex, cc: number, channel: number): number {
    const patch = this.sequencerStore.patch
    const existing = patch.steps[step].envelopes.find(
      (envelope) => envelope.cc === cc && envelope.channel === channel,
    )
    if (existing !== undefined) {
      return existing.id
    }
    const id = nextEnvelopeId(patch)
    this.sequencerStore.patch = addEnvelope(patch, step, {
      cc,
      channel,
      points: [],
    })
    return id
  }

  // A rest keeps its state: it still lands, so its envelopes still play.
  private setPoints(step: StepIndex, id: number, points: EnvelopePointJSON[]) {
    this.sequencerStore.patch = updateEnvelope(
      this.sequencerStore.patch,
      step,
      id,
      { points },
    )
    const lane = this.recordedLane
    if (lane === null || lane.step !== step || lane.id !== id) {
      const envelope = this.sequencerStore.patch.steps[step].envelopes.find(
        (each) => each.id === id,
      )
      if (envelope !== undefined) {
        const { cc, channel } = envelope
        this.recordedLane = { step, id, cc, channel }
      }
    }
  }
}

/**
 * How far a recorded stroke may be thinned from what was played. Messages
 * from a knob arrive unevenly in time, so kept exactly a steady sweep comes
 * out as a staircase of handles: measured on one, 20 points at the lossless
 * half-step, 3 at two, with nothing played moving by more than two in 127.
 * Two keeps the gesture's bends and drops the jitter of its messages.
 */
const RECORDED_TOLERANCE = 2

/**
 * A time on the step, moved to the grid the engine reads envelopes on —
 * every 1/48 beat — so a stroke never holds more points than can be heard,
 * and a burst of messages inside one slot keeps only the last.
 */
const onReadGrid = (time: number, lengthBeats: number): number => {
  const slots = lengthBeats / ENVELOPE_RESOLUTION
  return Math.min(1, Math.round(time * slots) / slots)
}
