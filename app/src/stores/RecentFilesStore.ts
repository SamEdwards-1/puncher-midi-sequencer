import { action, makeObservable, observable } from "mobx"
import {
  defaultRecentFilesStorage,
  RecentFile,
  RecentFilesStorage,
  RecentKind,
} from "../services/RecentFilesStorage"

export const RECENT_FILES_LIMIT = 5

// the same file on disk, where the browser can tell; by name where it can't
const sameFile = async (a: FileSystemFileHandle, b: FileSystemFileHandle) => {
  if (a === b) {
    return true
  }
  if (typeof a.isSameEntry !== "function") {
    return a.name === b.name
  }
  return a.isSameEntry(b).catch(() => false)
}

/**
 * The files used lately, newest first and a handful of each: patches opened
 * or saved, and MIDI files imported. They are kept in the browser, so they
 * are there on the next visit. Only a browser with file pickers gives
 * handles to keep; elsewhere the lists stay empty.
 */
export class RecentFilesStore {
  patch: RecentFile[] = []
  midi: RecentFile[] = []
  // what was kept, read in before anything is added over it
  private ready: Promise<void> = Promise.resolve()

  constructor(
    private readonly storage: RecentFilesStorage = defaultRecentFilesStorage(),
  ) {
    makeObservable<RecentFilesStore, "set">(this, {
      patch: observable.ref,
      midi: observable.ref,
      set: action,
    })
  }

  init = () => {
    this.ready = (async () => {
      for (const kind of ["patch", "midi"] as const) {
        // a store that can't be opened leaves the list empty
        const kept = await this.storage.load(kind).catch(() => [])
        this.set(kind, kept.slice(0, RECENT_FILES_LIMIT))
      }
    })()
    return this.ready
  }

  /** Puts a file at the top of its list, moving it there if it was below. */
  add = async (kind: RecentKind, file: RecentFile) => {
    await this.ready
    const others: RecentFile[] = []
    for (const each of this[kind]) {
      if (!(await sameFile(each.handle, file.handle))) {
        others.push(each)
      }
    }
    await this.keep(kind, [file, ...others].slice(0, RECENT_FILES_LIMIT))
  }

  /** Takes a file off its list, as one that has gone. */
  remove = async (kind: RecentKind, file: RecentFile) => {
    await this.ready
    await this.keep(
      kind,
      this[kind].filter((each) => each !== file),
    )
  }

  private async keep(kind: RecentKind, files: RecentFile[]) {
    this.set(kind, files)
    // a full or blocked store only costs remembering them next time
    await this.storage.save(kind, files).catch(() => undefined)
  }

  private set(kind: RecentKind, files: RecentFile[]) {
    this[kind] = files
  }
}
