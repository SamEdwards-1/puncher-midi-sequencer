import {
  createDefaultMIDIFilter,
  FilterableMessage,
  filterMIDIMessage,
  MIDI_CLOCK,
  MIDIFilterJSON,
} from "@midiseq/core"

export interface MIDINoteMessage {
  type: "noteOn" | "noteOff"
  channel: number
  note: number
  velocity: number
}

export interface MIDICCMessage {
  type: "cc"
  channel: number
  cc: number
  value: number
}

export interface MIDIClockTick {
  type: "clock"
}

export type MIDIInputMessage = MIDINoteMessage | MIDICCMessage | MIDIClockTick

export type MIDIInputListener = (message: MIDIInputMessage) => void

// Notes, controllers, and the clock tick a tempo can be read from. Start and
// stop are deliberately left alone: midiseq keeps its own transport.

export const parseInputMessage = (
  data: Uint8Array | number[],
): MIDIInputMessage | null => {
  if (data.length === 0) {
    return null
  }
  // a realtime byte stands alone and belongs to no channel
  if (data[0] === MIDI_CLOCK) {
    return { type: "clock" }
  }
  if (data.length < 3) {
    return null
  }
  const status = data[0] & 0xf0
  const channel = (data[0] & 0x0f) + 1
  const [, first, second] = data
  if (status === 0x90 && second > 0) {
    return { type: "noteOn", channel, note: first, velocity: second }
  }
  if (status === 0x80 || (status === 0x90 && second === 0)) {
    return { type: "noteOff", channel, note: first, velocity: 0 }
  }
  if (status === 0xb0) {
    return { type: "cc", channel, cc: first, value: second }
  }
  return null
}

/** Kept for the callers that only ever wanted notes. */
export const parseNoteMessage = (
  data: Uint8Array | number[],
): MIDINoteMessage | null => {
  const message = parseInputMessage(data)
  if (message === null || message.type === "cc" || message.type === "clock") {
    return null
  }
  return message
}

/**
 * Listens to the chosen input ports and hands what the filter allows to its
 * listeners. Several ports can be open at once; a message is treated the same
 * whichever one it came from.
 */
export class MIDIInput {
  private ports: MIDIInputPort[] = []
  private filter: MIDIFilterJSON = createDefaultMIDIFilter()
  private readonly listeners = new Set<MIDIInputListener>()

  setPorts(ports: MIDIInputPort[]) {
    for (const port of this.ports) {
      if (!ports.includes(port)) {
        port.onmidimessage = null
      }
    }
    for (const port of ports) {
      if (!this.ports.includes(port)) {
        port.onmidimessage = (event) => this.handleMessage(event.data)
      }
    }
    this.ports = [...ports]
  }

  setFilter(filter: MIDIFilterJSON) {
    this.filter = filter
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
    const parsed = parseInputMessage(data)
    if (parsed === null) {
      return
    }
    // a filter is about channels, notes and controllers; a clock has none
    if (parsed.type === "clock") {
      for (const listener of this.listeners) {
        listener(parsed)
      }
      return
    }
    const allowed = filterMIDIMessage(
      parsed as FilterableMessage,
      this.filter,
    ) as MIDIInputMessage | null
    if (allowed === null) {
      return
    }
    for (const listener of this.listeners) {
      listener(allowed)
    }
  }
}

// The part of a Web MIDI input the service needs.
export interface MIDIInputPort {
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null
}
