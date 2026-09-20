import { createFile, PatchJSON, parseFile, serializeFile } from "@midiseq/core"

const KEY = "midiseq.autosave"
const INTERVAL_MS = 10000

/**
 * Keeps the working patch in local storage so a crash or an accidental close
 * doesn't lose it. This is recovery only; saving to a file is separate.
 */
export class AutoSaveService {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly getPatch: () => PatchJSON,
    private readonly isSaved: () => boolean,
    private readonly storage: Storage | null = safeStorage(),
  ) {}

  start(intervalMs = INTERVAL_MS) {
    this.stop()
    this.timer = setInterval(() => this.save(), intervalMs)
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  save() {
    if (this.isSaved()) {
      return
    }
    try {
      this.storage?.setItem(KEY, serializeFile(createFile(this.getPatch())))
    } catch {
      // storage can be full or blocked; the patch just won't be recoverable
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
