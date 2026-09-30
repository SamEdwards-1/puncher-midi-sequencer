import { describe, expect, it, vi } from "vitest"
import {
  MemorySoundFontStorage,
  SoundFontStorage,
} from "../services/SoundFontStorage"
import { soundBank } from "../test/fakes"
import {
  FACTORY_SOUNDFONT,
  FACTORY_SOUNDFONT_URL,
  isSoundBank,
  SoundFontStore,
} from "./SoundFontStore"

const memoryStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

// kept fetches, as the IndexedDB store keeps them
class CachingStorage extends MemorySoundFontStorage {
  readonly fetched = new Map<string, ArrayBuffer>()
  override async cached(url: string) {
    return this.fetched.get(url) ?? null
  }
  override async cache(url: string, data: ArrayBuffer) {
    this.fetched.set(url, data)
  }
}

const setup = (fonts: SoundFontStorage = new MemorySoundFontStorage()) => {
  const storage = memoryStorage()
  const fetchFont = vi.fn(async () => soundBank())
  const store = new SoundFontStore(fonts, storage, fetchFont)
  return { store, storage, fonts, fetchFont }
}

describe("isSoundBank", () => {
  it("knows a SoundFont or DLS by its header", () => {
    expect(isSoundBank(soundBank("sfbk"))).toBe(true)
    expect(isSoundBank(soundBank("DLS "))).toBe(true)
    expect(isSoundBank(soundBank("WAVE"))).toBe(false)
    expect(isSoundBank(new ArrayBuffer(4))).toBe(false)
  })
})

describe("SoundFontStore", () => {
  it("starts with the factory set chosen", async () => {
    const { store } = setup()
    await store.init()
    expect(store.files).toEqual([FACTORY_SOUNDFONT])
    expect(store.selected).toEqual(FACTORY_SOUNDFONT)
  })

  it("keeps a font added from disk, chooses it, and remembers the choice", async () => {
    const { store, storage, fonts } = setup()
    await store.init()

    const id = await store.add("Piano.sf2", soundBank())
    expect(store.files.map((file) => file.name)).toEqual([
      FACTORY_SOUNDFONT.name,
      "Piano.sf2",
    ])
    expect(store.selectedId).toBe(id)

    // the next visit finds it there, and still chosen
    const again = new SoundFontStore(fonts, storage)
    await again.init()
    expect(again.selected.name).toBe("Piano.sf2")
    expect(await again.bytes(id)).toEqual(soundBank())
  })

  it("gives each reader a copy of its own, for a render to take away", async () => {
    const { store } = setup()
    await store.init()
    const id = await store.add("Piano.sf2", soundBank())
    const taken = await store.bytes(id)
    // handed to a worker, as a render's are
    structuredClone(taken, { transfer: [taken] })
    expect(taken.byteLength).toBe(0)
    expect(await store.bytes(id)).toEqual(soundBank())
  })

  it("turns away a file that isn't a sound bank", async () => {
    const { store } = setup()
    await expect(store.add("notes.txt", soundBank("WAVE"))).rejects.toThrow(
      "notes.txt isn't a SoundFont",
    )
    await store.init()
    expect(store.files).toHaveLength(1)
  })

  it("goes back to the factory set when the chosen font is removed", async () => {
    const { store } = setup()
    await store.init()
    const id = await store.add("Piano.sf2", soundBank())

    await store.remove(id)
    expect(store.files).toEqual([FACTORY_SOUNDFONT])
    expect(store.selectedId).toBe(FACTORY_SOUNDFONT.id)

    // and never removes that
    await store.remove(FACTORY_SOUNDFONT.id)
    expect(store.files).toEqual([FACTORY_SOUNDFONT])
  })

  it("lets go of a remembered choice that is no longer saved", async () => {
    const storage = memoryStorage()
    storage.setItem("midiseq.soundFont", "7")
    const store = new SoundFontStore(new MemorySoundFontStorage(), storage)
    expect(store.selectedId).toBe(7)
    await store.init()
    expect(store.selectedId).toBe(FACTORY_SOUNDFONT.id)
  })

  it("fetches the factory set once, then reads it from the browser", async () => {
    const fonts = new CachingStorage()
    const { store, fetchFont } = setup(fonts)

    await store.bytes(FACTORY_SOUNDFONT.id)
    expect(fetchFont).toHaveBeenCalledWith(FACTORY_SOUNDFONT_URL)
    expect(fonts.fetched.has(FACTORY_SOUNDFONT_URL)).toBe(true)

    await store.bytes(FACTORY_SOUNDFONT.id)
    expect(fetchFont).toHaveBeenCalledTimes(1)
  })

  it("still plays where the browser can't keep anything", async () => {
    const broken: SoundFontStorage = {
      list: () => Promise.reject(new Error("blocked")),
      add: () => Promise.reject(new Error("blocked")),
      load: () => Promise.reject(new Error("blocked")),
      remove: () => Promise.reject(new Error("blocked")),
      cached: () => Promise.reject(new Error("blocked")),
      cache: () => Promise.reject(new Error("blocked")),
    }
    const { store, fetchFont } = setup(broken)
    await store.init()
    expect(store.files).toEqual([FACTORY_SOUNDFONT])
    expect(await store.bytes(FACTORY_SOUNDFONT.id)).toEqual(soundBank())
    expect(fetchFont).toHaveBeenCalledTimes(1)
  })
})
