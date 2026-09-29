/** Patches opened or saved, and MIDI files imported, each kept apart. */
export type RecentKind = "patch" | "midi"

/**
 * A file used lately, by the handle the picker gave, which can be opened
 * again without the picker — once the browser allows it to be read again.
 */
export interface RecentFile {
  name: string
  handle: FileSystemFileHandle
}

/** Where the lists of recent files are kept between visits. */
export interface RecentFilesStorage {
  load(kind: RecentKind): Promise<RecentFile[]>
  save(kind: RecentKind, files: RecentFile[]): Promise<void>
}

const DB_NAME = "midiseq-recent-files"
const DB_VERSION = 1
const LISTS = "lists"

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const committed = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

/** The browser's IndexedDB, the one place a file's handle can be kept. */
export class IndexedDBRecentFilesStorage implements RecentFilesStorage {
  private db: Promise<IDBDatabase> | null = null

  constructor(private readonly factory: IDBFactory) {}

  private open() {
    this.db ??= new Promise((resolve, reject) => {
      const request = this.factory.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(LISTS)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.db
  }

  async load(kind: RecentKind) {
    const db = await this.open()
    const files = await done(db.transaction(LISTS).objectStore(LISTS).get(kind))
    return Array.isArray(files) ? (files as RecentFile[]) : []
  }

  async save(kind: RecentKind, files: RecentFile[]) {
    const db = await this.open()
    const transaction = db.transaction(LISTS, "readwrite")
    transaction.objectStore(LISTS).put(files, kind)
    await committed(transaction)
  }
}

/** Kept for the visit only, where the browser has no IndexedDB, or blocks it. */
export class MemoryRecentFilesStorage implements RecentFilesStorage {
  private readonly lists = new Map<RecentKind, RecentFile[]>()

  async load(kind: RecentKind) {
    return this.lists.get(kind) ?? []
  }

  async save(kind: RecentKind, files: RecentFile[]) {
    this.lists.set(kind, files)
  }
}

export const defaultRecentFilesStorage = (): RecentFilesStorage => {
  try {
    if (typeof indexedDB !== "undefined") {
      return new IndexedDBRecentFilesStorage(indexedDB)
    }
  } catch {
    // blocked, as some private windows do
  }
  return new MemoryRecentFilesStorage()
}
