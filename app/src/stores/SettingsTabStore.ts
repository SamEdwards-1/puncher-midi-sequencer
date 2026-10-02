import { action, makeObservable, observable } from "mobx"
import { defaultStorage, read, write } from "./storage"

const STORAGE_KEY = "midiseq.settingsTab"

// The settings dialog's groups, in the order its tabs show them.
export type SettingsTab =
  | "general"
  | "theme"
  | "midi"
  | "soundfont"
  | "export"
  | "import"
export const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "theme",
  "midi",
  "soundfont",
  "export",
  "import",
]

/**
 * Whether the settings dialog is open, and which group it shows: General the
 * first time, then whichever was open when it was last closed.
 */
export class SettingsTabStore {
  tab: SettingsTab
  // not saved: the dialog always starts closed
  open = false

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    const saved = read(storage, STORAGE_KEY)
    this.tab = SETTINGS_TABS.includes(saved as SettingsTab)
      ? (saved as SettingsTab)
      : "general"
    makeObservable(this, {
      tab: observable,
      open: observable,
      set: action,
      show: action,
      close: action,
    })
  }

  set = (tab: SettingsTab) => {
    this.tab = tab
    write(this.storage, STORAGE_KEY, tab)
  }

  // opens the dialog, at a group of its own if asked for one
  show = (tab?: SettingsTab) => {
    if (tab !== undefined) {
      this.set(tab)
    }
    this.open = true
  }

  close = () => {
    this.open = false
  }
}
