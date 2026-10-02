import {
  createDefaultPatch,
  exportStepMidi,
  setSequencer,
  setStepNotes,
  setVoice,
} from "@midiseq/core"
import { describe, expect, it } from "vitest"
import { StepWork, StepWorkJob, StepWorkResult } from "./StepWork"
import { runStepWork } from "./stepWorkRunner"

class ManualWorker {
  onmessage: ((event: MessageEvent<StepWorkResult>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  jobs: StepWorkJob[] = []
  terminated = false

  postMessage(job: StepWorkJob) {
    this.jobs.push(job)
  }
  terminate() {
    this.terminated = true
  }
  finish() {
    const job = this.jobs.shift()
    if (job === undefined) throw new Error("No worker job")
    this.onmessage?.({ data: runStepWork(job) } as MessageEvent<StepWorkResult>)
  }
}

describe("StepWork", () => {
  const setup = () => {
    const worker = new ManualWorker()
    return { worker, work: new StepWork(() => worker as unknown as Worker) }
  }

  it("keeps render-time reads cheap, deduplicates consumers, and publishes only current results", () => {
    const { worker, work } = setup()
    const patch = setStepNotes(createDefaultPatch(), 0, [60])
    const empty = work.readPreview(patch, 0, 20)
    expect(empty.notes).toEqual([])
    expect(worker.jobs).toHaveLength(0)

    work.requestPreview(patch, 0, 20)
    work.requestPreview(patch, 0, 20)
    work.requestPreview(setSequencer(patch, { name: "Renamed" }), 0, 20)
    expect(worker.jobs).toHaveLength(1)

    // A burst while the first job is running keeps only the latest edit.
    const next = setVoice(patch, 0, { velocity: 90 })
    const latest = setVoice(next, 0, { velocity: 100 })
    work.requestPreview(next, 0, 20)
    work.requestPreview(latest, 0, 20)
    worker.finish()
    expect(worker.jobs).toHaveLength(1)
    expect(worker.jobs[0].patch).toBe(latest)
    expect(work.readPreview(latest, 0, 20).notes[0]?.velocity).toBe(64)
    worker.finish()
    expect(work.readPreview(latest, 0, 20).notes[0]?.velocity).toBe(100)
    expect(work.made).toBe(2)
  })

  it("supersedes queued auditions and does not hand a late result to a newer request", async () => {
    const { worker, work } = setup()
    const patch = setStepNotes(createDefaultPatch(), 0, [60])
    const first = work.prepareEvents(patch, 0, 20)
    const second = work.prepareEvents(patch, 1, 20)
    expect(await first).toBeNull()
    worker.finish()
    expect(worker.jobs).toHaveLength(1)
    worker.finish()
    expect((await second)?.some((event) => event.type === "noteOn")).toBe(false)
  })

  it("prepares current MIDI bytes and releases work on disposal", async () => {
    const { worker, work } = setup()
    const patch = setStepNotes(createDefaultPatch(), 0, [60])
    const options = {
      voices: [0] as const,
      ccs: [],
      layout: "perVoice" as const,
      passes: 1,
      seed: 7,
      accentAmount: 20,
    }
    const file = work.prepareMidi(patch, 0, options)
    worker.finish()
    expect(await file).toEqual(exportStepMidi(patch, 0, options))
    const pending = work.prepareMidi(patch, 0, options)
    work.dispose()
    expect(await pending).toBeNull()
    expect(worker.terminated).toBe(true)
    worker.finish()
    expect(work.snapshot()).toBe(0)
  })

  it("keeps worker failure away from the UI thread", async () => {
    const { worker, work } = setup()
    const patch = setStepNotes(createDefaultPatch(), 0, [60])
    work.requestPreview(patch, 0, 20)
    const pending = work.prepareEvents(patch, 0, 20)
    worker.onerror?.({ preventDefault() {} } as ErrorEvent)
    expect(await pending).toBeNull()
    expect(worker.terminated).toBe(true)
    expect(work.readPreview(patch, 0, 20).status).toBe("unavailable")
    expect(work.made).toBe(0)
  })
})
