import { MIDISink } from "../services/MIDISink"
import { Ticker } from "../services/Ticker"

export interface SentMessage {
  data: number[]
  time: number | undefined
}

export class FakeSink implements MIDISink {
  readonly sent: SentMessage[] = []
  clearCount = 0

  send(data: number[], time?: number) {
    this.sent.push({ data, time })
  }

  clear() {
    this.clearCount++
  }

  // messages of one kind, by status nibble (0x90 note on, 0x80 off, 0xb0 cc)
  ofType(status: number): SentMessage[] {
    return this.sent.filter((message) => (message.data[0] & 0xf0) === status)
  }
}

export class ManualTicker implements Ticker {
  private onTick: (() => void) | null = null

  start(onTick: () => void) {
    this.onTick = onTick
  }

  stop() {
    this.onTick = null
  }

  get isRunning() {
    return this.onTick !== null
  }

  tick() {
    this.onTick?.()
  }
}

export class FakeClock {
  time = 0

  now = () => this.time
}

// The start of a SoundFont, or with another kind, some other RIFF file.
export const soundBank = (kind = "sfbk") =>
  new TextEncoder().encode(`RIFF\0\0\0\0${kind}rest`).buffer as ArrayBuffer
