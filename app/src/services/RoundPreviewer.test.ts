import { createDefaultPatch, Engine, PatchJSON } from "@midiseq/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createWorkerRoundPreviewer,
  LONGEST_RESTART_MS,
  PlayedRound,
  RESTART_MS,
  RoundJob,
  WorkerReply,
} from "./RoundPreviewer"
import { RoundStats } from "./RoundStats"

class FakeWorker {
  static made: FakeWorker[] = []
  // whether making a worker throws, as one that is not allowed does
  static refused = false
  // what posting takes, in ms on the test's clock
  static postCost = 0
  posted: Record<string, unknown>[] = []
  onmessage: ((event: { data: WorkerReply }) => void) | null = null
  onmessageerror: (() => void) | null = null
  onerror: ((event: { preventDefault(): void }) => void) | null = null
  terminated = false
  // whether posting throws, as for a round that cannot be copied
  uncloneable = false

  constructor() {
    if (FakeWorker.refused) {
      throw new DOMException("Workers are not allowed here", "SecurityError")
    }
    FakeWorker.made.push(this)
  }

  postMessage(data: Record<string, unknown>) {
    if (this.uncloneable) {
      throw new DOMException("Could not be cloned", "DataCloneError")
    }
    time += FakeWorker.postCost
    this.posted.push(data)
  }

  terminate() {
    this.terminated = true
  }

  // hands back what the round it was sent last played, which took `ms`
  reply(ms = 0) {
    const { id, revision } = this.posted[this.posted.length - 1]
    this.onmessage?.({
      data: { id, revision, notes: [], ms } as WorkerReply,
    })
  }

  // fails, as a worker does when a round throws in it
  crash() {
    this.onerror?.({ preventDefault: () => {} })
  }
}

// the test's clock, which performance.now reads
let time = 0

const patchWithNotes = (note: number): PatchJSON => {
  const patch = createDefaultPatch()
  patch.steps[0].notes = [note]
  return patch
}

const job = (
  id: number,
  revision: number,
  patch: PatchJSON,
  accentAmount = 20,
): RoundJob => {
  const engine = new Engine(patch)
  engine.start(0)
  return { id, revision, from: engine.snapshot(), patch, accentAmount }
}

describe("createWorkerRoundPreviewer", () => {
  let queue: RoundJob[]
  let played: PlayedRound[]
  let lost: RoundJob[]
  let stats: RoundStats
  // As a player does: a round lost goes back to the front of the queue.
  // One taken from a player since stopped has nowhere to go back to.
  let stopped: boolean
  const create = () =>
    createWorkerRoundPreviewer(
      {
        next: () => queue.shift() ?? null,
        played: (round) => played.push(round),
        lost: (each) => {
          lost.push(each)
          if (!stopped) {
            queue.unshift(each)
          }
        },
      },
      stats,
    )

  beforeEach(() => {
    FakeWorker.made = []
    FakeWorker.refused = false
    FakeWorker.postCost = 0
    queue = []
    played = []
    lost = []
    stats = new RoundStats()
    stopped = false
    time = 0
    vi.stubGlobal("Worker", FakeWorker)
    vi.spyOn(performance, "now").mockImplementation(() => time)
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("plays one round at a time, sending the patch only when it changes", () => {
    const first = patchWithNotes(60)
    const edited = patchWithNotes(62)
    queue = [job(0, 0, first), job(1, 0, first), job(1, 1, edited)]
    const previewer = create()
    previewer.wake()
    previewer.wake()

    const [worker] = FakeWorker.made
    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0]).toMatchObject({ id: 0, patch: first })

    worker.reply()
    expect(played.map(({ id }) => id)).toEqual([0])
    expect(worker.posted).toHaveLength(2)
    expect(worker.posted[1]).toMatchObject({ id: 1, revision: 0 })
    expect(worker.posted[1]).not.toHaveProperty("patch")

    worker.reply()
    expect(worker.posted[2]).toMatchObject({
      id: 1,
      revision: 1,
      patch: edited,
    })
    worker.reply()
    expect(played.map(({ id, revision }) => [id, revision])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ])
    // nothing more to play, so nothing more is sent
    expect(worker.posted).toHaveLength(3)
    expect(FakeWorker.made).toHaveLength(1)
  })

  it("sends a new accent amount without the patch it already has", () => {
    const patch = patchWithNotes(60)
    queue = [job(0, 0, patch, 20), job(0, 1, patch, 30)]
    create().wake()
    const [worker] = FakeWorker.made
    worker.reply()

    expect(worker.posted[1]).toMatchObject({ revision: 1, accentAmount: 30 })
    expect(worker.posted[1]).not.toHaveProperty("patch")
    // what came back is the round alone
    expect(played[0]).toEqual({ id: 0, revision: 0, notes: [] })
  })

  describe("should the worker fail", () => {
    it("plays nothing on this thread, and hands back the round under way", () => {
      const patch = patchWithNotes(60)
      const underWay = job(0, 0, patch)
      const waiting = job(1, 0, patch)
      queue = [underWay, waiting]
      create().wake()

      const [worker] = FakeWorker.made
      worker.crash()
      expect(worker.terminated).toBe(true)
      expect(played).toEqual([])
      expect(lost).toEqual([underWay])
      expect(queue).toEqual([underWay, waiting])
    })

    it("starts another a little later, sending it the patch again", () => {
      const patch = patchWithNotes(60)
      queue = [job(0, 0, patch), job(1, 0, patch)]
      const previewer = create()
      previewer.wake()
      FakeWorker.made[0].crash()

      // woken meanwhile, it waits for the restart
      previewer.wake()
      vi.advanceTimersByTime(RESTART_MS - 1)
      expect(FakeWorker.made).toHaveLength(1)
      vi.advanceTimersByTime(1)
      const [, restarted] = FakeWorker.made
      expect(restarted.posted).toEqual([
        expect.objectContaining({ id: 0, patch, accentAmount: 20 }),
      ])

      restarted.reply()
      expect(played.map(({ id }) => id)).toEqual([0])
      expect(restarted.posted[1]).toMatchObject({ id: 1 })
      expect(restarted.posted[1]).not.toHaveProperty("patch")
    })

    it("waits longer for each failure in a row, and starts over once a round comes back", () => {
      const patch = patchWithNotes(60)
      queue = Array.from({ length: 4 }, (_, id) => job(id, 0, patch))
      create().wake()
      const restartsAfter = () => {
        const made = FakeWorker.made.length
        FakeWorker.made[made - 1].crash()
        let waited = 0
        while (FakeWorker.made.length === made) {
          vi.advanceTimersByTime(RESTART_MS)
          waited += RESTART_MS
        }
        return waited
      }

      const waits = Array.from({ length: 10 }, restartsAfter)
      expect(waits).toEqual([
        RESTART_MS,
        RESTART_MS * 2,
        RESTART_MS * 4,
        RESTART_MS * 8,
        RESTART_MS * 16,
        RESTART_MS * 32,
        RESTART_MS * 64,
        LONGEST_RESTART_MS,
        LONGEST_RESTART_MS,
        LONGEST_RESTART_MS,
      ])
      FakeWorker.made[FakeWorker.made.length - 1].reply()
      expect(restartsAfter()).toBe(RESTART_MS)
    })

    it("ignores whatever the failed one still has on its way", () => {
      const patch = patchWithNotes(60)
      queue = [job(0, 0, patch)]
      create().wake()
      const [worker] = FakeWorker.made
      worker.crash()
      worker.reply()
      worker.crash()

      expect(played).toEqual([])
      expect(lost).toHaveLength(1)
    })

    it("fails the same when it cannot be made", () => {
      FakeWorker.refused = true
      const patch = patchWithNotes(60)
      const asked = job(0, 0, patch)
      queue = [asked]
      create().wake()
      expect(lost).toEqual([asked])

      FakeWorker.refused = false
      vi.advanceTimersByTime(RESTART_MS)
      expect(FakeWorker.made[0].posted).toEqual([
        expect.objectContaining({ id: 0, patch }),
      ])
    })

    it("fails the same when a reply cannot be read", () => {
      const patch = patchWithNotes(60)
      queue = [job(0, 0, patch)]
      create().wake()
      const [worker] = FakeWorker.made
      worker.onmessageerror?.()

      expect(worker.terminated).toBe(true)
      expect(lost.map(({ id }) => id)).toEqual([0])
      vi.advanceTimersByTime(RESTART_MS)
      expect(FakeWorker.made).toHaveLength(2)
    })

    it("fails the same when a round cannot be posted", () => {
      const patch = patchWithNotes(60)
      queue = [job(0, 0, patch), job(1, 0, patch)]
      create().wake()
      const [worker] = FakeWorker.made
      worker.uncloneable = true
      worker.reply()

      expect(worker.terminated).toBe(true)
      expect(played.map(({ id }) => id)).toEqual([0])
      expect(lost.map(({ id }) => id)).toEqual([1])
      expect(stats.report()).toMatchObject({ failures: 1, workers: 1 })
    })

    it("starts no other when the player has stopped since", () => {
      const patch = patchWithNotes(60)
      queue = [job(0, 0, patch)]
      create().wake()
      stopped = true
      FakeWorker.made[0].crash()

      vi.advanceTimersByTime(LONGEST_RESTART_MS)
      expect(FakeWorker.made).toHaveLength(1)
    })
  })

  it("ends its worker when disposed, and plays nothing more", () => {
    const patch = patchWithNotes(60)
    queue = [job(0, 0, patch), job(1, 0, patch)]
    const previewer = create()
    previewer.wake()
    const [worker] = FakeWorker.made

    previewer.dispose()
    previewer.dispose()
    expect(worker.terminated).toBe(true)
    // a reply already on its way is dropped, and waking starts no worker
    worker.reply()
    previewer.wake()
    expect(played).toEqual([])
    expect(FakeWorker.made).toHaveLength(1)
  })

  it("starts no worker once disposed while waiting to restart", () => {
    const patch = patchWithNotes(60)
    queue = [job(0, 0, patch)]
    const previewer = create()
    previewer.wake()
    FakeWorker.made[0].crash()
    previewer.dispose()
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(LONGEST_RESTART_MS)
    previewer.wake()
    expect(FakeWorker.made).toHaveLength(1)
  })

  it("times posting, playing, and the rest of the wait apart", () => {
    const patch = patchWithNotes(60)
    queue = [job(0, 0, patch), job(1, 0, patch)]
    FakeWorker.postCost = 3
    create().wake()
    const [worker] = FakeWorker.made
    time += 40
    worker.reply(25)

    expect(stats.report()).toMatchObject({
      patchesSent: 1,
      workers: 1,
      post: { max: 3 },
      play: { max: 25 },
      wait: { max: 15 },
      latency: { max: 43 },
    })
  })

  it("plays on this thread where there are no workers", () => {
    vi.stubGlobal("Worker", undefined)
    const patch = patchWithNotes(60)
    queue = [job(0, 0, patch), job(1, 0, patch)]
    create().wake()

    expect(FakeWorker.made).toHaveLength(0)
    expect(played.map(({ id }) => id)).toEqual([0, 1])
    expect(played[0].notes.length).toBeGreaterThan(0)
  })
})
