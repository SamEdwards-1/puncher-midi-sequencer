import { MIDISink } from "../services/MIDISink"
import {
  CreateRoundPreviewer,
  PlayedRound,
  playJob,
  RoundJob,
} from "../services/RoundPreviewer"
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

// Plays rounds ahead only when told to, as a worker would in its own time.
export class ManualRoundPreviewer {
  wakes = 0
  private next: () => RoundJob | null = () => null
  private played: (round: PlayedRound) => void = () => {}

  readonly create: CreateRoundPreviewer = (next, played) => {
    this.next = next
    this.played = played
    return { wake: () => this.wakes++, dispose: () => {} }
  }

  // the next round the player wants played, without playing it yet
  take(): RoundJob | null {
    return this.next()
  }

  // hands back what a round taken earlier played
  finish(job: RoundJob) {
    this.played(playJob(job))
  }
}

export class FakeClock {
  time = 0

  now = () => this.time
}

// The start of a SoundFont, or with another kind, some other RIFF file.
export const soundBank = (kind = "sfbk") =>
  new TextEncoder().encode(`RIFF\0\0\0\0${kind}rest`).buffer as ArrayBuffer
