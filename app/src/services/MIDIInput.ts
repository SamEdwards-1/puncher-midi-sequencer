export interface MIDINoteMessage {
  type: "noteOn" | "noteOff"
  channel: number
  note: number
  velocity: number
}

export type MIDIInputListener = (message: MIDINoteMessage) => void

// Note messages only; everything else (clock, CC) is ignored until the
// milestones that need it.
export const parseNoteMessage = (
  data: Uint8Array | number[],
): MIDINoteMessage | null => {
  if (data.length < 3) {
    return null
  }
  const status = data[0] & 0xf0
  const channel = (data[0] & 0x0f) + 1
  const [, note, velocity] = data
  if (status === 0x90 && velocity > 0) {
    return { type: "noteOn", channel, note, velocity }
  }
  if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    return { type: "noteOff", channel, note, velocity: 0 }
  }
  return null
}

// Listens to one input port at a time and hands parsed notes to listeners.
export class MIDIInput {
  private port: MIDIInputPort | null = null
  private readonly listeners = new Set<MIDIInputListener>()

  setPort(port: MIDIInputPort | null) {
    if (this.port === port) {
      return
    }
    if (this.port !== null) {
      this.port.onmidimessage = null
    }
    this.port = port
    if (port !== null) {
      port.onmidimessage = (event) => this.handleMessage(event.data)
    }
  }

  on(listener: MIDIInputListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  handleMessage(data: Uint8Array | number[] | null) {
    if (data === null) {
      return
    }
    const message = parseNoteMessage(data)
    if (message === null) {
      return
    }
    for (const listener of this.listeners) {
      listener(message)
    }
  }
}

// The part of a Web MIDI input the service needs.
export interface MIDIInputPort {
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null
}
