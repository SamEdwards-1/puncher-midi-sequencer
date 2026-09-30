import {
  Engine,
  EngineSnapshot,
  PatchJSON,
  playRound,
  StepNote,
} from "@midiseq/core"

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
 * Plays rounds ahead for their notes, one at a time. Woken when there is a
 * round to play, it takes each from `next` — which has the soonest, as the
 * patch is by then — and hands what it played to `played`, until `next` has
 * none left.
 */
export interface RoundPreviewer {
  wake(): void
}

export type CreateRoundPreviewer = (
  next: () => RoundJob | null,
  played: (round: PlayedRound) => void,
) => RoundPreviewer

// Plays each round as soon as it is asked for: where there are no workers.
export const createInThreadRoundPreviewer: CreateRoundPreviewer = (
  next,
  played,
) => ({
  wake() {
    for (let job = next(); job !== null; job = next()) {
      played(playJob(job))
    }
  },
})

// What goes to the worker: the patch only when it has changed.
export type WorkerJob = Omit<RoundJob, "patch" | "accentAmount"> &
  Partial<Pick<RoundJob, "patch" | "accentAmount">>

/**
 * A long step's round, with fast voices, takes far longer to play than a
 * tick has to spare, and an edit plays the rounds again, so they are played
 * on a worker, where they hold up neither the scheduling nor the page. One
 * at a time, so a burst of edits only ever waits on the round under way.
 */
export const createWorkerRoundPreviewer: CreateRoundPreviewer = (
  next,
  played,
) => {
  if (typeof Worker === "undefined") {
    return createInThreadRoundPreviewer(next, played)
  }
  let worker: Worker | null = null
  let underWay: RoundJob | null = null
  // what the worker has been sent of the patch
  let sent: Pick<RoundJob, "patch" | "accentAmount"> | null = null
  // should the worker fail, the rounds are played here instead
  let inThread: RoundPreviewer | null = null

  const start = () => {
    const started = new Worker(
      new URL("./roundPreview.worker.ts", import.meta.url),
      { type: "module" },
    )
    started.onmessage = ({ data }: MessageEvent<PlayedRound>) => {
      underWay = null
      played(data)
      wake()
    }
    started.onerror = (event) => {
      event.preventDefault()
      started.terminate()
      inThread = createInThreadRoundPreviewer(next, played)
      const lost = underWay
      underWay = null
      if (lost !== null) {
        played(playJob(lost))
      }
      inThread.wake()
    }
    return started
  }

  const wake = () => {
    if (inThread !== null) {
      inThread.wake()
      return
    }
    if (underWay !== null) {
      return
    }
    const job = next()
    if (job === null) {
      return
    }
    worker ??= start()
    const { patch, accentAmount, ...rest } = job
    const changed =
      sent === null ||
      sent.patch !== patch ||
      sent.accentAmount !== accentAmount
    worker.postMessage(changed ? job : (rest satisfies WorkerJob))
    sent = { patch, accentAmount }
    underWay = job
  }

  return { wake }
}
