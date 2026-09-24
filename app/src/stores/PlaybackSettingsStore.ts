import {
  DEFAULT_ACCENT_AMOUNT,
  MAX_ACCENT_AMOUNT,
  MIN_ACCENT_AMOUNT,
} from "@midiseq/core"
import { action, makeObservable, observable } from "mobx"
import { defaultStorage, read, write } from "./storage"

const ACCENT_STORAGE_KEY = "midiseq.accentAmount"

const clampAccent = (amount: number) =>
  Math.min(MAX_ACCENT_AMOUNT, Math.max(MIN_ACCENT_AMOUNT, Math.round(amount)))

const loadAccent = (storage: Storage | null): number => {
  const saved = read(storage, ACCENT_STORAGE_KEY)
  return typeof saved === "number" && Number.isFinite(saved)
    ? clampAccent(saved)
    : DEFAULT_ACCENT_AMOUNT
}

/**
 * How this machine plays a patch, kept with the other settings rather than
 * in the patch, as OODA keeps it: how far an accent moves a note's velocity.
 */
export class PlaybackSettingsStore {
  accentAmount: number

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    this.accentAmount = loadAccent(storage)
    makeObservable(this, {
      accentAmount: observable,
      setAccentAmount: action,
    })
  }

  setAccentAmount = (amount: number) => {
    this.accentAmount = clampAccent(amount)
    write(this.storage, ACCENT_STORAGE_KEY, this.accentAmount)
  }
}
