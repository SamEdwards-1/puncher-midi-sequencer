import { DEFAULT_ACCENT_AMOUNT, PatchJSON } from "@midiseq/core"
import { playJob, WorkerJob, WorkerReply } from "./RoundPreviewer"

let patch: PatchJSON | null = null
let accentAmount = DEFAULT_ACCENT_AMOUNT

/**
 * Plays rounds of the sequencer ahead for their notes, one per message, off
 * the page's thread, and says how long each took. The patch comes with a
 * round only when it has changed, and holds for the rounds after.
 */
self.onmessage = ({ data }: MessageEvent<WorkerJob>) => {
  patch = data.patch ?? patch
  accentAmount = data.accentAmount ?? accentAmount
  if (patch === null) {
    throw new Error("A round came before any patch")
  }
  const start = performance.now()
  const round = playJob({ ...data, patch, accentAmount })
  const reply: WorkerReply = { ...round, ms: performance.now() - start }
  self.postMessage(reply)
}

// A round that cannot be read fails the worker, as one that throws does.
self.onmessageerror = () => {
  throw new Error("A round could not be read")
}
