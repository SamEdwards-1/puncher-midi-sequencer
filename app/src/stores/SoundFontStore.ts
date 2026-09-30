import { action, computed, makeObservable, observable } from "mobx"
import {
  defaultSoundFontStorage,
  SoundFontStorage,
} from "../services/SoundFontStorage"
import { defaultStorage, read, write } from "./storage"

const STORAGE_KEY = "midiseq.soundFont"

export interface SoundFontFile {
  id: number
  name: string
  // one of the app's own, which can't be removed
  builtIn: boolean
  // who made it, and under what licence, for the ones the app offers
  credit?: { author: string; licence: string; licenceUrl: string }
}

// The GM set Signal ships, so the built-in sound needs nothing bundled.
export const FACTORY_SOUNDFONT_URL =
  "https://cdn.jsdelivr.net/gh/ryohey/signal@6959f35/public/A320U.sf2"

// Below zero, so it can never be an id IndexedDB hands out.
export const FACTORY_SOUNDFONT: SoundFontFile = {
  id: -1,
  name: "A320U.sf2 (Signal Factory Sound)",
  builtIn: true,
  // as the licence file Signal ships beside it says
  credit: {
    author: "Milton Paredes",
    licence: "GNU GPL v2",
    licenceUrl: "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
  },
}

// What a file picker offers: SoundFont 2 and 3, Ogg-packed SoundFonts, DLS.
export const SOUNDFONT_EXTENSIONS = [".sf2", ".sf3", ".sfogg", ".dls"]

/**
 * Whether the bytes are a sound bank at all, by the RIFF header every kind
 * starts with. Anything else is turned away before it is saved.
 */
export const isSoundBank = (data: ArrayBuffer) => {
  if (data.byteLength < 12) {
    return false
  }
  const text = (from: number) =>
    String.fromCharCode(...new Uint8Array(data, from, 4))
  return text(0) === "RIFF" && ["sfbk", "DLS "].includes(text(8))
}

const defaultFetch = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Couldn't fetch the SoundFont (${response.status})`)
  }
  return response.arrayBuffer()
}

/**
 * The SoundFonts the built-in sound can play: the factory set, and any added
 * from disk, which are kept in the browser. The one chosen is remembered, and
 * its bytes come from the browser before the web, so the sound starts
 * quickly once it has been heard once.
 */
export class SoundFontStore {
  files: SoundFontFile[] = [FACTORY_SOUNDFONT]
  selectedId: number

  constructor(
    private readonly fonts: SoundFontStorage = defaultSoundFontStorage(),
    private readonly storage: Storage | null = defaultStorage(),
    private readonly fetchFont: (
      url: string,
    ) => Promise<ArrayBuffer> = defaultFetch,
  ) {
    const saved = read(storage, STORAGE_KEY)
    this.selectedId = typeof saved === "number" ? saved : FACTORY_SOUNDFONT.id
    makeObservable(this, {
      files: observable.ref,
      selectedId: observable,
      selected: computed,
      select: action,
    })
  }

  get selected(): SoundFontFile {
    return (
      this.files.find((file) => file.id === this.selectedId) ??
      FACTORY_SOUNDFONT
    )
  }

  /** Reads what was saved, and lets go of a choice that has since gone. */
  init = async () => {
    await this.refresh()
    if (!this.files.some((file) => file.id === this.selectedId)) {
      this.select(FACTORY_SOUNDFONT.id)
    }
  }

  select = (id: number) => {
    this.selectedId = id
    write(this.storage, STORAGE_KEY, id)
  }

  /**
   * Keeps a file from disk, and chooses it, which also puts it to the test:
   * a bank the synth can't read says so as it loads.
   */
  add = async (name: string, data: ArrayBuffer) => {
    if (!isSoundBank(data)) {
      throw new Error(`${name} isn't a SoundFont`)
    }
    const id = await this.fonts.add(name, data)
    await this.refresh()
    this.select(id)
    return id
  }

  remove = async (id: number) => {
    if (id === FACTORY_SOUNDFONT.id) {
      return
    }
    await this.fonts.remove(id)
    await this.refresh()
    if (this.selectedId === id) {
      this.select(FACTORY_SOUNDFONT.id)
    }
  }

  /**
   * A font's bytes: from the browser where it has them, else the web. Each
   * call's are its own, so they can be handed to a worker, not copied.
   */
  bytes = async (id: number): Promise<ArrayBuffer> => {
    if (id !== FACTORY_SOUNDFONT.id) {
      const data = await this.fonts.load(id)
      if (data === null) {
        throw new Error("That SoundFont is no longer saved")
      }
      return data
    }
    const url = FACTORY_SOUNDFONT_URL
    const cached = await this.fonts.cached(url).catch(() => null)
    if (cached !== null) {
      return cached
    }
    const data = await this.fetchFont(url)
    // kept for next time; a full or blocked store only costs a download
    await this.fonts.cache(url, data).catch(() => undefined)
    return data
  }

  private async refresh() {
    // a store that can't be opened leaves just the factory set
    const saved = await this.fonts.list().catch(() => [])
    this.files = [
      FACTORY_SOUNDFONT,
      ...saved.map((file) => ({ ...file, builtIn: false })),
    ]
  }
}
