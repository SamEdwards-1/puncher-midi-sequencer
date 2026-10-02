import { MIDISink } from "../services/MIDISink"
import {
  CreateRoundPreviewer,
  playJob,
  RoundJob,
  RoundQueue,
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
  disposed = false
  private queue: RoundQueue = {
    next: () => null,
    played: () => {},
    lost: () => {},
  }

  readonly create: CreateRoundPreviewer = (queue) => {
    this.queue = queue
    return {
      wake: () => this.wakes++,
      dispose: () => {
        this.disposed = true
      },
    }
  }

  // the next round the player wants played, without playing it yet
  take(): RoundJob | null {
    return this.queue.next()
  }

  // every round the player wants played, without playing any of them yet
  takeAll(): RoundJob[] {
    const jobs: RoundJob[] = []
    for (let job = this.take(); job !== null; job = this.take()) {
      jobs.push(job)
    }
    return jobs
  }

  // hands back what a round taken earlier played
  finish(job: RoundJob) {
    this.queue.played(playJob(job))
  }

  // hands back a round taken earlier unplayed, as a failed worker does
  lose(job: RoundJob) {
    this.queue.lost(job)
  }
}

export class FakeClock {
  time = 0

  now = () => this.time
}

// The start of a SoundFont, or with another kind, some other RIFF file.
export const soundBank = (kind = "sfbk") =>
  new TextEncoder().encode(`RIFF\0\0\0\0${kind}rest`).buffer as ArrayBuffer
