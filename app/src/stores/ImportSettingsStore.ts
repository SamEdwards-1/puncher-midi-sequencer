import { action, makeObservable, observable } from "mobx"
import { defaultStorage, read, write } from "./storage"

const STORAGE_KEY = "midiseq.midiImport"

// What the ends of an import's stretch snap to as they are dragged.
export type ImportSnap = "bar" | "beat" | "off"
export const IMPORT_SNAPS: ImportSnap[] = ["bar", "beat", "off"]

interface Saved {
  skipDrums: boolean
  ccs: boolean
  loop: boolean
  fileTempo: boolean
  snap: ImportSnap
}

const DEFAULTS: Saved = {
  skipDrums: true,
  ccs: false,
  loop: false,
  fileTempo: true,
  snap: "bar",
}

const load = (storage: Storage | null): Saved => {
  const saved = read(storage, STORAGE_KEY) as Partial<Saved> | null
  if (saved === null || typeof saved !== "object") {
    return DEFAULTS
  }
  const flag = (key: keyof Omit<Saved, "snap">) =>
    typeof saved[key] === "boolean" ? (saved[key] as boolean) : DEFAULTS[key]
  return {
    skipDrums: flag("skipDrums"),
    ccs: flag("ccs"),
    loop: flag("loop"),
    fileTempo: flag("fileTempo"),
    snap: IMPORT_SNAPS.includes(saved.snap as ImportSnap)
      ? (saved.snap as ImportSnap)
      : DEFAULTS.snap,
  }
}

/**
 * How a MIDI import starts, kept with this machine's other settings: whether
 * the drum channel is left out, whether the file's CCs come in, whether the
 * stretch goes round until the grid is full, whether the file's tempo is
 * taken, and what the stretch's ends snap to. Each import can change them
 * for itself; these are where it starts.
 */
export class ImportSettingsStore {
  skipDrums: boolean
  ccs: boolean
  loop: boolean
  fileTempo: boolean
  snap: ImportSnap

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    const saved = load(storage)
    this.skipDrums = saved.skipDrums
    this.ccs = saved.ccs
    this.loop = saved.loop
    this.fileTempo = saved.fileTempo
    this.snap = saved.snap
    makeObservable(this, {
      skipDrums: observable,
      ccs: observable,
      loop: observable,
      fileTempo: observable,
      snap: observable,
      set: action,
    })
  }

  set = <K extends keyof Saved>(key: K, value: Saved[K]) => {
    this[key] = value as this[K]
    write(this.storage, STORAGE_KEY, {
      skipDrums: this.skipDrums,
      ccs: this.ccs,
      loop: this.loop,
      fileTempo: this.fileTempo,
      snap: this.snap,
    })
  }
}
