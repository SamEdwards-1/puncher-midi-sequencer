import {
  addEnvelope,
  dropRepeats,
  ENVELOPE_RESOLUTION,
  EnvelopePointJSON,
  EnvelopeShape,
  envelopeShape,
  fitToScale,
  isControlPosition,
  modulationForCC,
  nextEnvelopeId,
  paceBeats,
  paintPoints,
  StepIndex,
  simplifyPoints,
  snapToModulation,
  stepCount,
  stepPace,
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
  dirty: boolean
}

/**
 * A knob being turned while stopped. Runs retain exact sample placement,
 * including repeat counts; buckets bound reconstruction of the live picture.
 */
interface CCCollection {
  step: StepIndex
  id: number
  shape: EnvelopeShape
  // Runs retain the original sample indexes, so repeats still occupy time.
  runs: { start: number; end: number; value: number }[]
  buckets: SampleBucket[]
  count: number
  dirty: boolean
  summarized: boolean
}

interface IndexedSample {
  index: number
  value: number
}

interface SampleBucket {
  first: IndexedSample
  last: IndexedSample
  low: IndexedSample
  high: IndexedSample
}

interface RecordingTimer {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimeout(id: ReturnType<typeof setTimeout>): void
}

interface CCRecordingLimits {
  laneSamples: number
  takeSamples: number
}

const CC_PUBLISH_MS = 33
const LIVE_PREVIEW_POINTS = 2_048
const PREVIEW_BUCKET_SAMPLES = 64
const DEFAULT_CC_LIMITS: CCRecordingLimits = {
  laneSamples: 32_768,
  takeSamples: 65_536,
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
  recordingError: string | null = null
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
  private pending: ReturnType<typeof setTimeout> | null = null
  private takeSamples = 0
  private readonly offInput: () => void
  private disposed = false

  constructor(
    private readonly sequencerStore: SequencerStore,
    input: MIDIInput,
    // called once when a take starts, so the take is one undo entry
    private readonly beforeTake: () => void = () => {},
    // where the sequence is, or null when stopped
    private readonly progress: () => StepProgress | null = () => null,
    private readonly timer: RecordingTimer = globalThis,
    private readonly limits: CCRecordingLimits = DEFAULT_CC_LIMITS,
  ) {
    makeObservable(this, {
      isRecording: observable,
      target: observable,
      recordedLane: observable.ref,
      recordingError: observable.ref,
    })
    this.offInput = input.on(this.onMessage)
  }

  setRecording = (recording: boolean) => {
    if (this.disposed) return
    if (recording === this.isRecording) {
      return
    }
    if (recording) {
      this.beforeTake()
      this.recordingError = null
      this.takeSamples = 0
    } else {
      this.flushPending(true)
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
    this.flushPending(true)
    this.target = step
    // a step picked by hand starts fresh
    this.written = null
  }

  onMessage = (message: MIDIInputMessage) => {
    if (!this.isRecording || this.disposed) {
      return
    }
    if (message.type === "noteOn") {
      this.record(message.note)
    } else if (message.type === "cc") {
      this.recordCC(message)
    }
  }

  private record(played: number) {
    // fitted to the patch's scale, as its fit says; a note the fit leaves
    // out is not written at all
    const { scale } = this.sequencerStore.patch
    const note = scale === null ? played : fitToScale(scale, played, scale.fit)
    if (note === null) {
      return
    }
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
    this.flushPending(true)
    const size = this.sequencerStore.patch.size
    this.target = (this.target + 1) % stepCount(size)
    this.written = null
  }

  private recordCC({ cc, channel, value: sent }: MIDICCMessage) {
    // commands and protocol, not a knob's position: nothing to draw
    if (!isControlPosition(cc)) {
      return
    }
    // a knob on a CC that modulates a setting lands on the setting's values
    const modulation = modulationForCC(this.sequencerStore.patch, cc)
    const value =
      modulation === undefined ? sent : snapToModulation(modulation, sent)
    const key = `${cc}/${channel}`
    const progress = this.progress()
    if (progress === null) {
      if (this.passes.size > 0) {
        this.flushPending(true)
        this.passes.clear()
      }
      this.collectCC(key, cc, channel, value)
      return
    }

    if (this.collections.size > 0) {
      this.flushPending(true)
      this.collections.clear()
    }

    const slot = onReadGrid(progress.time, progress.lengthBeats)
    let pass = this.passes.get(key)
    // a knob turned on a new step starts over there
    if (pass === undefined || pass.step !== progress.step) {
      if (pass !== undefined) this.flushPending()
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
        dirty: false,
      }
      this.passes.set(key, pass)
      this.selectLane(progress.step, id)
    }
    if (pass.slots.get(slot) === value) return
    pass.slots.set(slot, value)
    pass.dirty = true
    this.schedulePublish()
  }

  // Stopped: every value this take has sent to the target, spread across it.
  private collectCC(key: string, cc: number, channel: number, value: number) {
    const step = this.target
    let collection = this.collections.get(key)
    // a new target starts over there, and the first value of a take replaces
    // whatever the step held, as the first note does
    if (collection === undefined || collection.step !== step) {
      if (collection !== undefined) this.flushPending(true)
      const id = this.envelopeFor(step, cc, channel)
      const envelope = this.sequencerStore.patch.steps[step].envelopes.find(
        (each) => each.id === id,
      )
      collection = {
        step,
        id,
        shape: envelope === undefined ? "steps" : envelopeShape(envelope),
        runs: [],
        buckets: [],
        count: 0,
        dirty: false,
        summarized: false,
      }
      this.collections.set(key, collection)
      this.selectLane(step, id)
    }
    if (
      collection.count >= this.limits.laneSamples ||
      this.takeSamples >= this.limits.takeSamples
    ) {
      this.setRecording(false)
      this.recordingError = `CC recording stopped at the supported limit (${this.limits.laneSamples.toLocaleString()} samples per lane, ${this.limits.takeSamples.toLocaleString()} per take). The captured samples were kept.`
      return
    }
    const index = collection.count++
    this.takeSamples++
    const last = collection.runs.at(-1)
    if (last?.value === value) {
      last.end = index
    } else {
      collection.runs.push({ start: index, end: index, value })
    }
    const sample = { index, value }
    const bucketIndex = Math.floor(index / PREVIEW_BUCKET_SAMPLES)
    const bucket = collection.buckets[bucketIndex]
    if (bucket === undefined) {
      collection.buckets.push({
        first: sample,
        last: sample,
        low: sample,
        high: sample,
      })
    } else {
      bucket.last = sample
      if (value < bucket.low.value) bucket.low = sample
      if (value > bucket.high.value) bucket.high = sample
    }
    collection.dirty = true
    this.schedulePublish()
  }

  private schedulePublish() {
    if (this.pending !== null) return
    this.pending = this.timer.setTimeout(() => {
      this.pending = null
      if (!this.disposed) this.flushPending()
    }, CC_PUBLISH_MS)
  }

  /** Publish every dirty lane in one patch replacement. */
  private flushPending(final = false) {
    if (this.pending !== null) {
      this.timer.clearTimeout(this.pending)
      this.pending = null
    }
    let patch = this.sequencerStore.patch
    let changed = false
    for (const pass of this.passes.values()) {
      if (!pass.dirty) continue
      const played = [...pass.slots]
        .sort(([a], [b]) => a - b)
        .map(([time, value]) => ({ time, value }))
      const stroke =
        pass.shape === "steps"
          ? dropRepeats(played)
          : simplifyPoints(played, RECORDED_TOLERANCE)
      patch = updateEnvelope(patch, pass.step, pass.id, {
        points: toBeatTimes(
          paintPoints(pass.before, pass.from, 1, stroke, pass.shape),
          pass.lengthBeats,
        ),
      })
      pass.dirty = false
      changed = true
    }
    for (const collection of this.collections.values()) {
      if (!collection.dirty && !(final && collection.summarized)) continue
      const { count, runs, shape, step } = collection
      const lastIndex = count - 1
      const spread: EnvelopePointJSON[] = []
      const time = (index: number) =>
        shape === "steps"
          ? index / count
          : lastIndex === 0
            ? 0
            : index / lastIndex
      const summarized = !final && count > LIVE_PREVIEW_POINTS
      if (summarized) {
        // Four landmarks per fixed-size bucket keep live publication bounded
        // while preserving the bucket's extrema. The final flush uses every
        // captured run, so the saved curve has the original tolerance.
        for (const bucket of collection.buckets) {
          const landmarks = [
            bucket.first,
            bucket.low,
            bucket.high,
            bucket.last,
          ].sort((a, b) => a.index - b.index)
          let previous = -1
          for (const sample of landmarks) {
            if (sample.index === previous) continue
            spread.push({ time: time(sample.index), value: sample.value })
            previous = sample.index
          }
        }
      } else {
        for (const run of runs) {
          spread.push({ time: time(run.start), value: run.value })
          // Both ends of a flat run matter to ramp simplification.
          if (shape === "ramps" && run.end !== run.start) {
            spread.push({ time: time(run.end), value: run.value })
          }
        }
      }
      patch = updateEnvelope(patch, step, collection.id, {
        points: toBeatTimes(
          shape === "steps"
            ? dropRepeats(spread)
            : simplifyPoints(spread, RECORDED_TOLERANCE),
          paceBeats(stepPace(patch, step)),
        ),
      })
      collection.dirty = false
      collection.summarized = summarized
      changed = true
    }
    if (changed) this.sequencerStore.patch = patch
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

  // Open the recorded lane as soon as input arrives, before its timed publish.
  private selectLane(step: StepIndex, id: number) {
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

  dispose() {
    if (this.disposed) return
    this.flushPending(true)
    this.disposed = true
    this.offInput()
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
