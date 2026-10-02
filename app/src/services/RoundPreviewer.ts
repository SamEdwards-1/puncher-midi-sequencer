import {
  Engine,
  EngineSnapshot,
  PatchJSON,
  playRound,
  StepNote,
} from "@midiseq/core"
import { RoundStats } from "./RoundStats"

/**
 * A round of the sequencer to play ahead for its notes: the engine as it was
 * just before the round, and the patch as it is now, at `revision` — which
 * counts the edits, so notes played before one can be told from those after.
 */
export interface RoundJob {
  id: number
  revision: number
  from: EngineSnapshot
  patch: PatchJSON
  accentAmount: number
}

export interface PlayedRound {
  id: number
  revision: number
  notes: StepNote[]
}

export const playJob = (job: RoundJob): PlayedRound => ({
  id: job.id,
  revision: job.revision,
  notes: playRound(
    new Engine(job.patch, { accentAmount: job.accentAmount, from: job.from }),
  ).notes,
})

/**
 * The rounds waiting to be played ahead, as a previewer takes them: `next`
 * hands over the soonest, as the patch is by then, or null once none is
 * waiting; `played` takes each back played; and `lost` takes back one handed
 * over that will not be played after all, to hand over again.
 */
export interface RoundQueue {
  next(): RoundJob | null
  played(round: PlayedRound): void
  lost(job: RoundJob): void
}

/**
 * Plays rounds ahead for their notes, one at a time. Woken when there is a
 * round to play, it takes each from its queue and hands it back played,
 * until the queue has none left. Once disposed it plays nothing more, and
 * waking it does nothing.
 */
export interface RoundPreviewer {
  wake(): void
  dispose(): void
}

export type CreateRoundPreviewer = (
  queue: RoundQueue,
  stats?: RoundStats,
) => RoundPreviewer

// Plays each round as soon as it is asked for, on this thread: only where
// there are no workers at all.
export const createInThreadRoundPreviewer: CreateRoundPreviewer = (
  queue,
  stats = new RoundStats(),
) => {
  let disposed = false
  return {
    wake() {
      for (
        let job = queue.next();
        !disposed && job !== null;
        job = queue.next()
      ) {
        const start = performance.now()
        const round = playJob(job)
        const ms = performance.now() - start
        stats.cameBack(0, ms, ms)
        queue.played(round)
      }
    },
    dispose() {
      disposed = true
    },
  }
}

// What goes to the worker: the patch and accent amount only when changed.
export type WorkerJob = Omit<RoundJob, "patch" | "accentAmount"> &
  Partial<Pick<RoundJob, "patch" | "accentAmount">>

// What comes back: the round played, and how long playing it took, in ms.
export interface WorkerReply extends PlayedRound {
  ms: number
}

// How long after a worker fails the next is started: doubled for each
// failure in a row, up to the longest.
export const RESTART_MS = 250
export const LONGEST_RESTART_MS = 30_000

/**
 * A long step's round, with fast voices, takes far longer to play than a
 * tick has to spare, and an edit plays the rounds again, so they are played
 * on a worker, where they hold up neither the scheduling nor the page. One
 * at a time, so a burst of edits only ever waits on the round under way.
 *
 * A worker that fails — one that cannot start, throws, or has a message
 * fail to cross — is ended, deaf to anything it still has on its way. The
 * round under way goes back to the queue, and another worker is started a
 * little later, and later again for each failure in a row. Nothing is played
 * on this thread meanwhile: the rounds keep what they last showed, and the
 * sequence plays on regardless.
 */
export const createWorkerRoundPreviewer: CreateRoundPreviewer = (
  queue,
  stats = new RoundStats(),
) => {
  if (typeof Worker === "undefined") {
    return createInThreadRoundPreviewer(queue, stats)
  }
  let worker: Worker | null = null
  // the round under way, when it was asked for, and how long posting it took
  let underWay: { job: RoundJob; asked: number; post: number } | null = null
  // what the worker has been sent of the patch
  let sent: Pick<RoundJob, "patch" | "accentAmount"> | null = null
  // the failures since a round last came back, and the restart they wait on
  let failures = 0
  let restart: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const end = () => {
    if (worker !== null) {
      worker.onmessage = null
      worker.onmessageerror = null
      worker.onerror = null
      worker.terminate()
      worker = null
    }
    sent = null
  }

  const fail = () => {
    end()
    stats.failed()
    const lost = underWay
    underWay = null
    if (lost !== null) {
      queue.lost(lost.job)
    }
    failures++
    restart = setTimeout(
      () => {
        restart = null
        wake()
      },
      Math.min(LONGEST_RESTART_MS, RESTART_MS * 2 ** (failures - 1)),
    )
  }

  const start = (): Worker => {
    const started = new Worker(
      new URL("./roundPreview.worker.ts", import.meta.url),
      { type: "module" },
    )
    stats.started()
    started.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const { ms, ...round } = data
      if (underWay !== null) {
        const { asked, post } = underWay
        stats.cameBack(post, ms, performance.now() - asked)
      }
      underWay = null
      failures = 0
      queue.played(round)
      wake()
    }
    started.onmessageerror = fail
    started.onerror = (event) => {
      // handled here, rather than reported as uncaught as well
      event.preventDefault()
      fail()
    }
    return started
  }

  const wake = () => {
    if (disposed || restart !== null || underWay !== null) {
      return
    }
    const asked = performance.now()
    const job = queue.next()
    if (job === null) {
      return
    }
    const { patch, accentAmount, ...rest } = job
    const message: WorkerJob = { ...rest }
    if (patch !== sent?.patch) {
      message.patch = patch
    }
    if (accentAmount !== sent?.accentAmount) {
      message.accentAmount = accentAmount
    }
    underWay = { job, asked, post: 0 }
    try {
      worker ??= start()
      const posting = performance.now()
      worker.postMessage(message)
      underWay.post = performance.now() - posting
    } catch {
      // a worker that cannot be made, or a round that cannot be sent, is a
      // failure like any other
      fail()
      return
    }
    stats.posted(underWay.post, message.patch !== undefined)
    sent = { patch, accentAmount }
  }

  const dispose = () => {
    disposed = true
    if (restart !== null) {
      clearTimeout(restart)
      restart = null
    }
    end()
    underWay = null
  }

  return { wake, dispose }
}
