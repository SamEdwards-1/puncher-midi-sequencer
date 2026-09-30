import { createDefaultPatch, Engine, PatchJSON } from "@midiseq/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createWorkerRoundPreviewer,
  PlayedRound,
  playJob,
  RoundJob,
} from "./RoundPreviewer"

class FakeWorker {
  static made: FakeWorker[] = []
  posted: Record<string, unknown>[] = []
  onmessage: ((event: { data: PlayedRound }) => void) | null = null
  onerror: ((event: { preventDefault(): void }) => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.made.push(this)
  }

  postMessage(data: Record<string, unknown>) {
    this.posted.push(data)
  }

  terminate() {
    this.terminated = true
  }

  // hands back what the round it was sent last played
  reply() {
    const { id, revision } = this.posted[this.posted.length - 1]
    this.onmessage?.({
      data: { id, revision, notes: [] } as PlayedRound,
    })
  }
}

const patchWithNotes = (note: number): PatchJSON => {
  const patch = createDefaultPatch()
  patch.steps[0].notes = [note]
  return patch
}

const job = (id: number, revision: number, patch: PatchJSON): RoundJob => {
  const engine = new Engine(patch)
  engine.start(0)
  return { id, revision, from: engine.snapshot(), patch, accentAmount: 20 }
}

describe("createWorkerRoundPreviewer", () => {
  let queue: RoundJob[]
  let played: PlayedRound[]
  const next = () => queue.shift() ?? null
  const create = () =>
    createWorkerRoundPreviewer(next, (round) => played.push(round))

  beforeEach(() => {
    FakeWorker.made = []
    queue = []
    played = []
    vi.stubGlobal("Worker", FakeWorker)
  })

  afterEach(() => {
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

  it("plays on this thread should the worker fail, the round under way too", () => {
    const patch = patchWithNotes(60)
    const lost = job(0, 0, patch)
    const waiting = job(1, 0, patch)
    queue = [lost, waiting]
    create().wake()

    const [worker] = FakeWorker.made
    worker.onerror?.({ preventDefault: () => {} })
    expect(worker.terminated).toBe(true)
    expect(played).toEqual([playJob(lost), playJob(waiting)])
    expect(played[0].notes.length).toBeGreaterThan(0)
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

  it("plays on this thread where there are no workers", () => {
    vi.stubGlobal("Worker", undefined)
    const patch = patchWithNotes(60)
    queue = [job(0, 0, patch), job(1, 0, patch)]
    create().wake()

    expect(FakeWorker.made).toHaveLength(0)
    expect(played.map(({ id }) => id)).toEqual([0, 1])
  })
})
