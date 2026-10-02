import {
  EngineEvent,
  MidiExportOptions,
  PatchJSON,
  previewsAlike,
  StepIndex,
  StepPreview,
} from "@midiseq/core"

export type StepWorkJob =
  | {
      id: number
      kind: "preview" | "events"
      patch: PatchJSON
      step: StepIndex
      accentAmount: number
    }
  | {
      id: number
      kind: "midi"
      patch: PatchJSON
      step: StepIndex
      options: MidiExportOptions
    }

export type StepWorkResult =
  | { id: number; kind: "preview"; preview: StepPreview }
  | { id: number; kind: "events"; events: EngineEvent[] }
  | { id: number; kind: "midi"; bytes: Uint8Array }

export type ShownStepPreview = StepPreview & {
  status?: "pending" | "unavailable"
}
const EMPTY_PENDING: ShownStepPreview = {
  notes: [],
  voiceDots: [0, 0, 0, 0],
  status: "pending",
}
const EMPTY_UNAVAILABLE: ShownStepPreview = {
  notes: [],
  voiceDots: [0, 0, 0, 0],
  status: "unavailable",
}

type PreviewJob = Extract<StepWorkJob, { kind: "preview" | "events" }>
type MidiJob = Extract<StepWorkJob, { kind: "midi" }>

/** Optional visual and step-file work. A worker is started only on demand. */
export class StepWork {
  private worker: Worker | null = null
  private failed = false
  private disposed = false
  private nextId = 0
  private active: StepWorkJob | null = null
  private pendingPreview: PreviewJob | null = null
  private pendingEvents: PreviewJob | null = null
  private pendingMidi: MidiJob | null = null
  private eventReply: {
    id: number
    resolve: (events: EngineEvent[] | null) => void
  } | null = null
  private midiReply: {
    id: number
    resolve: (bytes: Uint8Array | null) => void
  } | null = null
  private listeners = new Set<() => void>()
  private version = 0
  private kept: {
    patch: PatchJSON
    step: StepIndex
    accentAmount: number
    preview: StepPreview
  }[] = []
  // Requests completed by the worker; useful when checking duplicate work.
  made = 0

  constructor(
    private readonly createWorker = () =>
      new Worker(new URL("./stepWork.worker.ts", import.meta.url), {
        type: "module",
      }),
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = () => this.version

  /** A render-time lookup only; a missing result keeps this step's last picture. */
  readPreview(
    patch: PatchJSON,
    step: StepIndex,
    accentAmount: number,
  ): ShownStepPreview {
    return (
      this.kept.find(
        (each) =>
          each.step === step &&
          each.accentAmount === accentAmount &&
          previewsAlike(each.patch, patch),
      )?.preview ??
      this.kept.find((each) => each.step === step)?.preview ??
      (this.failed ? EMPTY_UNAVAILABLE : EMPTY_PENDING)
    )
  }

  requestPreview(patch: PatchJSON, step: StepIndex, accentAmount: number) {
    if (
      this.disposed ||
      this.failed ||
      this.kept.some(
        (each) =>
          each.step === step &&
          each.accentAmount === accentAmount &&
          previewsAlike(each.patch, patch),
      )
    )
      return
    const alike = (job: StepWorkJob | null) =>
      job?.kind === "preview" &&
      job.step === step &&
      job.accentAmount === accentAmount &&
      previewsAlike(job.patch, patch)
    if (alike(this.active) || alike(this.pendingPreview)) return
    this.pendingPreview = {
      id: ++this.nextId,
      kind: "preview",
      patch,
      step,
      accentAmount,
    }
    this.pump()
  }

  /** A newer audition replaces an older queued one. The player also checks its token. */
  prepareEvents(patch: PatchJSON, step: StepIndex, accentAmount: number) {
    if (this.disposed || this.failed) return Promise.resolve(null)
    this.eventReply?.resolve(null)
    return new Promise<EngineEvent[] | null>((resolve) => {
      const id = ++this.nextId
      this.eventReply = { id, resolve }
      this.pendingEvents = {
        id,
        kind: "events",
        patch,
        step,
        accentAmount,
      }
      this.pump()
    })
  }

  /** Only the most recently approached step is prepared for drag-out. */
  prepareMidi(patch: PatchJSON, step: StepIndex, options: MidiExportOptions) {
    if (this.disposed || this.failed) return Promise.resolve(null)
    this.midiReply?.resolve(null)
    return new Promise<Uint8Array | null>((resolve) => {
      const id = ++this.nextId
      this.midiReply = { id, resolve }
      this.pendingMidi = {
        id,
        kind: "midi",
        patch,
        step,
        options,
      }
      this.pump()
    })
  }

  private start() {
    if (this.worker !== null) return this.worker
    try {
      const worker = this.createWorker()
      worker.onmessage = ({ data }: MessageEvent<StepWorkResult>) => {
        if (this.disposed || this.active?.id !== data.id) return
        const job = this.active
        this.active = null
        if (job.kind === "preview" && data.kind === "preview") {
          this.made++
          this.kept.unshift({
            patch: job.patch,
            step: job.step,
            accentAmount: job.accentAmount,
            preview: data.preview,
          })
          this.kept.length = Math.min(this.kept.length, 8)
          this.version++
          for (const listener of this.listeners) listener()
        } else if (job.kind === "events" && data.kind === "events") {
          if (this.eventReply?.id === data.id) {
            this.eventReply.resolve(data.events)
            this.eventReply = null
          }
        } else if (job.kind === "midi" && data.kind === "midi") {
          if (this.midiReply?.id === data.id) {
            this.midiReply.resolve(data.bytes)
            this.midiReply = null
          }
        }
        this.pump()
      }
      worker.onerror = (event) => {
        event.preventDefault()
        this.fail()
      }
      worker.onmessageerror = () => this.fail()
      this.worker = worker
      return worker
    } catch {
      this.fail()
      return null
    }
  }

  private pump() {
    if (this.disposed || this.failed || this.active !== null) return
    const job = this.pendingEvents ?? this.pendingPreview ?? this.pendingMidi
    if (job === null) return
    if (job === this.pendingEvents) this.pendingEvents = null
    else if (job === this.pendingPreview) this.pendingPreview = null
    else this.pendingMidi = null
    const worker = this.start()
    if (worker === null) return
    this.active = job
    try {
      worker.postMessage(job)
    } catch {
      this.fail()
    }
  }

  private fail() {
    this.failed = true
    this.worker?.terminate()
    this.worker = null
    this.active = null
    this.pendingPreview = null
    this.pendingEvents = null
    this.pendingMidi = null
    this.eventReply?.resolve(null)
    this.midiReply?.resolve(null)
    this.eventReply = null
    this.midiReply = null
    if (!this.disposed) {
      this.version++
      for (const listener of this.listeners) listener()
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.fail()
    this.listeners.clear()
    this.kept = []
  }
}
