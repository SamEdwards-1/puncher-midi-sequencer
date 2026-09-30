import { DEFAULT_ACCENT_AMOUNT, PatchJSON } from "@midiseq/core"
import { playJob, WorkerJob } from "./RoundPreviewer"

let patch: PatchJSON | null = null
let accentAmount = DEFAULT_ACCENT_AMOUNT

/**
 * Plays rounds of the sequencer ahead for their notes, one per message, off
 * the page's thread. The patch comes with a round only when it has changed,
 * and holds for the rounds after.
 */
self.onmessage = ({ data }: MessageEvent<WorkerJob>) => {
  patch = data.patch ?? patch
  accentAmount = data.accentAmount ?? accentAmount
  if (patch === null) {
    throw new Error("A round came before any patch")
  }
  self.postMessage(playJob({ ...data, patch, accentAmount }))
}
