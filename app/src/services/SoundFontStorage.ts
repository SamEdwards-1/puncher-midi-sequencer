export interface SavedSoundFont {
  id: number
  name: string
}

/**
 * Where SoundFonts are kept between visits: the ones added from disk, and a
 * copy of any fetched from the web, so the built-in sound starts without a
 * download after the first time. What is read out is the reader's own copy,
 * to use up or hand to another thread: none is shared with what is kept.
 */
export interface SoundFontStorage {
  list(): Promise<SavedSoundFont[]>
  add(name: string, data: ArrayBuffer): Promise<number>
  load(id: number): Promise<ArrayBuffer | null>
  remove(id: number): Promise<void>
  cached(url: string): Promise<ArrayBuffer | null>
  cache(url: string, data: ArrayBuffer): Promise<void>
}

const DB_NAME = "midiseq-soundfonts"
const DB_VERSION = 1
// names apart from the bytes, so listing them reads nothing large
const NAMES = "names"
const DATA = "data"
const FETCHED = "fetched"

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

/** The browser's IndexedDB, which holds files far bigger than local storage. */
export class IndexedDBSoundFontStorage implements SoundFontStorage {
  private db: Promise<IDBDatabase> | null = null

  constructor(private readonly factory: IDBFactory) {}

  private open() {
    this.db ??= new Promise((resolve, reject) => {
      const request = this.factory.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore(NAMES, { autoIncrement: true })
        db.createObjectStore(DATA)
        db.createObjectStore(FETCHED)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.db
  }

  async list() {
    const db = await this.open()
    const store = db.transaction(NAMES).objectStore(NAMES)
    const [keys, names] = await Promise.all([
      done(store.getAllKeys()),
      done(store.getAll() as IDBRequest<string[]>),
    ])
    return keys.map((key, index) => ({ id: Number(key), name: names[index] }))
  }

  async add(name: string, data: ArrayBuffer) {
    const db = await this.open()
    const transaction = db.transaction([NAMES, DATA], "readwrite")
    const id = Number(await done(transaction.objectStore(NAMES).add(name)))
    transaction.objectStore(DATA).put(data, id)
    await committed(transaction)
    return id
  }

  async load(id: number) {
    const db = await this.open()
    const data = await done(db.transaction(DATA).objectStore(DATA).get(id))
    return data instanceof ArrayBuffer ? data : null
  }

  async remove(id: number) {
    const db = await this.open()
    const transaction = db.transaction([NAMES, DATA], "readwrite")
    transaction.objectStore(NAMES).delete(id)
    transaction.objectStore(DATA).delete(id)
    await committed(transaction)
  }

  async cached(url: string) {
    const db = await this.open()
    const data = await done(
      db.transaction(FETCHED).objectStore(FETCHED).get(url),
    )
    return data instanceof ArrayBuffer ? data : null
  }

  async cache(url: string, data: ArrayBuffer) {
    const db = await this.open()
    const transaction = db.transaction(FETCHED, "readwrite")
    const store = transaction.objectStore(FETCHED)
    // one copy of the web's fonts is enough: an older address is dropped
    store.clear()
    store.put(data, url)
    await committed(transaction)
  }
}

/**
 * Kept for the visit only, where the browser has no IndexedDB, or blocks it.
 * Nothing fetched is kept: the browser's own cache does that much.
 */
export class MemorySoundFontStorage implements SoundFontStorage {
  private readonly fonts = new Map<
    number,
    { name: string; data: ArrayBuffer }
  >()
  private next = 1

  async list() {
    return [...this.fonts].map(([id, { name }]) => ({ id, name }))
  }

  async add(name: string, data: ArrayBuffer) {
    const id = this.next++
    this.fonts.set(id, { name, data: data.slice(0) })
    return id
  }

  // a copy, as IndexedDB reads one, so a render taking it leaves this whole
  async load(id: number) {
    return this.fonts.get(id)?.data.slice(0) ?? null
  }

  async remove(id: number) {
    this.fonts.delete(id)
  }

  async cached(_url: string): Promise<ArrayBuffer | null> {
    return null
  }

  async cache(_url: string, _data: ArrayBuffer) {}
}

export const defaultSoundFontStorage = (): SoundFontStorage => {
  try {
    if (typeof indexedDB !== "undefined") {
      return new IndexedDBSoundFontStorage(indexedDB)
    }
  } catch {
    // blocked, as some private windows do
  }
  return new MemorySoundFontStorage()
}
