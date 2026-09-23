import { NOTES_PER_STEP, stepCount } from "@midiseq/core"
import { makeObservable, observable } from "mobx"
import { SequencerStore } from "../stores/SequencerStore"
import { MIDIInput, MIDINoteMessage } from "./MIDIInput"

export type ReceiveChannel = number | "omni"

/**
 * Records notes played on the MIDI input into the step grid. A step holds one
 * note per voice, and it fills with all four before the target moves on — so
 * notes land as they are played, whether they arrive as a chord or one at a
 * time, and a fifth starts the next step rather than being lost.
 */
export class MIDIRecorder {
  isRecording = false
  target = 0

  // What this take has put on the target step, in the order played. Null
  // until the first note, which replaces whatever the step already held.
  private written: number[] | null = null

  constructor(
    private readonly sequencerStore: SequencerStore,
    input: MIDIInput,
    private readonly receiveChannel: () => ReceiveChannel,
    // called once when a take starts, so the take is one undo entry
    private readonly beforeTake: () => void = () => {},
  ) {
    makeObservable(this, {
      isRecording: observable,
      target: observable,
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

  onMessage = (message: MIDINoteMessage) => {
    if (!this.isRecording || message.type !== "noteOn") {
      return
    }
    const channel = this.receiveChannel()
    if (channel !== "omni" && channel !== message.channel) {
      return
    }
    this.record(message.note)
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

    if (notes.length >= NOTES_PER_STEP) {
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
}
