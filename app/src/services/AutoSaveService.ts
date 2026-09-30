import { createFile, PatchJSON, parseFile, serializeFile } from "@midiseq/core"

const KEY = "midiseq.autosave"
const INTERVAL_MS = 10000

/**
 * Keeps the working patch in local storage so a crash or an accidental close
 * doesn't lose it. This is recovery only; saving to a file is separate.
 */
export class AutoSaveService {
  private timer: ReturnType<typeof setInterval> | null = null
  // The patch reference last written to storage. Patches are immutable, so an
  // unchanged reference means the snapshot is already current.
  private persisted: PatchJSON | null = null

  constructor(
    private readonly getPatch: () => PatchJSON,
    private readonly isSaved: () => boolean,
    private readonly storage: Storage | null = safeStorage(),
  ) {}

  start(intervalMs = INTERVAL_MS) {
    this.stop()
    this.timer = setInterval(() => this.save(), intervalMs)
    // Flush before the page goes away rather than waiting for the next tick.
    window.addEventListener("pagehide", this.flush)
  }

  private readonly flush = () => this.save()

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    window.removeEventListener("pagehide", this.flush)
  }

  save() {
    if (this.isSaved()) {
      return
    }
    const patch = this.getPatch()
    if (patch === this.persisted) {
      return
    }
    try {
      this.storage?.setItem(KEY, serializeFile(createFile(patch)))
      this.persisted = patch
    } catch {
      // storage can be full or blocked; the next tick retries
    }
  }

  // The patch from the last autosave, if there is one worth restoring.
  restore(): PatchJSON | null {
    const text = this.storage?.getItem(KEY) ?? null
    if (text === null) {
      return null
    }
    const result = parseFile(text)
    return result.ok ? result.patch : null
  }

  clear() {
    this.persisted = null
    try {
      this.storage?.removeItem(KEY)
    } catch {
      // nothing to do
    }
  }
}

const safeStorage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
