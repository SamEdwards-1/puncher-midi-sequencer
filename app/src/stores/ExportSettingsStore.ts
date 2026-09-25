import { ExportLayout } from "@midiseq/core"
import { action, makeObservable, observable } from "mobx"
import { defaultStorage, read, write } from "./storage"

const STORAGE_KEY = "midiseq.midiExport"
export const MAX_EXPORT_PASSES = 16
const LAYOUTS: ExportLayout[] = ["perVoice", "combined"]

// A controller as the export settings keep it: its channel and number.
export const ccKey = ({ cc, channel }: { cc: number; channel: number }) =>
  `${channel}:${cc}`

interface Saved {
  voices: boolean[]
  excludedCCs: string[]
  layout: ExportLayout
  passes: number
}

const DEFAULTS: Saved = {
  voices: [true, true, true, true],
  excludedCCs: [],
  layout: "perVoice",
  passes: 1,
}

const clampPasses = (passes: number) =>
  Math.min(MAX_EXPORT_PASSES, Math.max(1, Math.round(passes)))

// Whatever was saved, where it still makes sense; the defaults elsewhere.
const load = (storage: Storage | null): Saved => {
  const saved = read(storage, STORAGE_KEY) as Partial<Saved> | null
  if (saved === null || typeof saved !== "object") {
    return DEFAULTS
  }
  return {
    voices:
      Array.isArray(saved.voices) && saved.voices.length === 4
        ? saved.voices.map((on) => on !== false)
        : DEFAULTS.voices,
    excludedCCs: Array.isArray(saved.excludedCCs)
      ? saved.excludedCCs.filter((key) => typeof key === "string")
      : DEFAULTS.excludedCCs,
    layout: LAYOUTS.includes(saved.layout as ExportLayout)
      ? (saved.layout as ExportLayout)
      : DEFAULTS.layout,
    passes:
      typeof saved.passes === "number" && Number.isFinite(saved.passes)
        ? clampPasses(saved.passes)
        : DEFAULTS.passes,
  }
}

/**
 * How MIDI is exported, kept with this machine's other settings: which
 * voices and CCs go in, whether each voice gets a track, and how many passes
 * through a sequence. The export dialogs and dragging a step out all use
 * these, and Settings shows them too, so a choice made in one is the choice
 * everywhere.
 *
 * CCs are kept as the ones left out, so a CC new to a sequence goes in
 * until it is unticked.
 */
export class ExportSettingsStore {
  voices: boolean[]
  excludedCCs: string[]
  layout: ExportLayout
  passes: number

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    const saved = load(storage)
    this.voices = saved.voices
    this.excludedCCs = saved.excludedCCs
    this.layout = saved.layout
    this.passes = saved.passes
    makeObservable(this, {
      voices: observable.ref,
      excludedCCs: observable.ref,
      layout: observable,
      passes: observable,
      setVoice: action,
      setCC: action,
      setCCs: action,
      setLayout: action,
      setPasses: action,
    })
  }

  setVoice = (index: number, on: boolean) => {
    this.voices = this.voices.map((each, voice) =>
      voice === index ? on : each,
    )
    this.save()
  }

  setCC = (cc: { cc: number; channel: number }, on: boolean) => {
    this.setCCs([cc], on)
  }

  // Ticks or unticks every one of `ccs` at once, for All.
  setCCs = (ccs: { cc: number; channel: number }[], on: boolean) => {
    const keys = new Set(ccs.map(ccKey))
    const rest = this.excludedCCs.filter((key) => !keys.has(key))
    this.excludedCCs = on ? rest : [...rest, ...keys]
    this.save()
  }

  setLayout = (layout: ExportLayout) => {
    this.layout = layout
    this.save()
  }

  setPasses = (passes: number) => {
    this.passes = clampPasses(passes)
    this.save()
  }

  private save() {
    write(this.storage, STORAGE_KEY, {
      voices: this.voices,
      excludedCCs: this.excludedCCs,
      layout: this.layout,
      passes: this.passes,
    })
  }
}
