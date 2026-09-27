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
  // the softest a note may be and still go in; 1 takes every note
  minVelocity: number
}

const DEFAULTS: Saved = {
  skipDrums: true,
  ccs: false,
  loop: false,
  fileTempo: true,
  snap: "bar",
  minVelocity: 1,
}

const load = (storage: Storage | null): Saved => {
  const saved = read(storage, STORAGE_KEY) as Partial<Saved> | null
  if (saved === null || typeof saved !== "object") {
    return DEFAULTS
  }
  const flag = (key: keyof Omit<Saved, "snap" | "minVelocity">) =>
    typeof saved[key] === "boolean" ? (saved[key] as boolean) : DEFAULTS[key]
  return {
    skipDrums: flag("skipDrums"),
    ccs: flag("ccs"),
    loop: flag("loop"),
    fileTempo: flag("fileTempo"),
    snap: IMPORT_SNAPS.includes(saved.snap as ImportSnap)
      ? (saved.snap as ImportSnap)
      : DEFAULTS.snap,
    minVelocity:
      typeof saved.minVelocity === "number"
        ? Math.min(127, Math.max(1, Math.round(saved.minVelocity)))
        : DEFAULTS.minVelocity,
  }
}

/**
 * How a MIDI import starts, kept with this machine's other settings: whether
 * the drum channel is left out, whether the file's CCs come in, whether the
 * stretch goes round until the grid is full, whether the file's tempo is
 * taken, what the stretch's ends snap to, and how softly a note may be
 * played and still go in. Each import can change them
 * for itself; these are where it starts.
 */
export class ImportSettingsStore {
  skipDrums: boolean
  ccs: boolean
  loop: boolean
  fileTempo: boolean
  snap: ImportSnap
  minVelocity: number

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    const saved = load(storage)
    this.skipDrums = saved.skipDrums
    this.ccs = saved.ccs
    this.loop = saved.loop
    this.fileTempo = saved.fileTempo
    this.snap = saved.snap
    this.minVelocity = saved.minVelocity
    makeObservable(this, {
      skipDrums: observable,
      ccs: observable,
      loop: observable,
      fileTempo: observable,
      snap: observable,
      minVelocity: observable,
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
      minVelocity: this.minVelocity,
    })
  }
}
