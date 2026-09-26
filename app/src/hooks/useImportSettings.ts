import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

// Where a MIDI import starts, a setting of this machine: see
// ImportSettingsStore.
export function useImportSettings() {
  const { importSettings } = useStores()
  return {
    skipDrums: useMobxGetter(importSettings, "skipDrums"),
    ccs: useMobxGetter(importSettings, "ccs"),
    loop: useMobxGetter(importSettings, "loop"),
    fileTempo: useMobxGetter(importSettings, "fileTempo"),
    snap: useMobxGetter(importSettings, "snap"),
    set: importSettings.set,
  }
}
