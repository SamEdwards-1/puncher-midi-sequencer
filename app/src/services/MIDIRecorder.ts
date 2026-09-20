import { stepCount } from "@midiseq/core"
import { makeObservable, observable } from "mobx"
import { SequencerStore } from "../stores/SequencerStore"
import { MIDIInput, MIDINoteMessage } from "./MIDIInput"

export type ReceiveChannel = number | "omni"

/**
 * Records notes played on the MIDI input into the step grid. Notes held
 * together land on one step, replacing whatever was there, and the target
 * then moves on, so playing a chord sequence fills consecutive steps.
 */
export class MIDIRecorder {
  isRecording = false
  target = 0

  private readonly held = new Set<number>()
  private chord: number[] = []

  constructor(
    private readonly sequencerStore: SequencerStore,
    input: MIDIInput,
    private readonly receiveChannel: () => ReceiveChannel,
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
    // finish anything still held when recording stops
    if (!recording) {
      this.commit()
    }
    this.held.clear()
    this.chord = []
    this.isRecording = recording
  }

  toggleRecording = () => {
    this.setRecording(!this.isRecording)
  }

  setTarget = (step: number) => {
    this.target = step
  }

  onMessage = (message: MIDINoteMessage) => {
    if (!this.isRecording) {
      return
    }
    const channel = this.receiveChannel()
    if (channel !== "omni" && channel !== message.channel) {
      return
    }

    if (message.type === "noteOn") {
      this.held.add(message.note)
      if (!this.chord.includes(message.note)) {
        this.chord.push(message.note)
      }
      return
    }

    this.held.delete(message.note)
    // the chord is finished once every key is released
    if (this.held.size === 0) {
      this.commit()
      this.advance()
    }
  }

  private commit() {
    if (this.chord.length === 0) {
      return
    }
    const patch = this.sequencerStore.patch
    // keep the notes played first when the chord is larger than the limit
    const notes = [...this.chord.slice(0, patch.maxNotesPerStep)].sort(
      (a, b) => a - b,
    )
    this.chord = []
    const target = this.target
    this.sequencerStore.patch = {
      ...patch,
      steps: patch.steps.map((step, index) =>
        index === target ? { ...step, notes, state: "normal" } : step,
      ),
    }
  }

  private advance() {
    const size = this.sequencerStore.patch.size
    this.target = (this.target + 1) % stepCount(size)
  }
}
