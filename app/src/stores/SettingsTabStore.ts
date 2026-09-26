import { action, makeObservable, observable } from "mobx"
import { defaultStorage, read, write } from "./storage"

const STORAGE_KEY = "midiseq.settingsTab"

// The settings dialog's groups, in the order its tabs show them.
export type SettingsTab = "general" | "theme" | "midi" | "export" | "import"
export const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "theme",
  "midi",
  "export",
  "import",
]

/**
 * Which group the settings dialog shows: General the first time, then
 * whichever was open when it was last closed.
 */
export class SettingsTabStore {
  tab: SettingsTab

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    const saved = read(storage, STORAGE_KEY)
    this.tab = SETTINGS_TABS.includes(saved as SettingsTab)
      ? (saved as SettingsTab)
      : "general"
    makeObservable(this, { tab: observable, set: action })
  }

  set = (tab: SettingsTab) => {
    this.tab = tab
    write(this.storage, STORAGE_KEY, tab)
  }
}
