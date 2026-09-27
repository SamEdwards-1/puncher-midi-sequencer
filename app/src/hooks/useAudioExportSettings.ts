import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

// How audio is rendered, a setting of this machine: see
// AudioExportSettingsStore.
export function useAudioExportSettings() {
  const { audioExportSettings } = useStores()
  return {
    settings: useMobxGetter(audioExportSettings, "settings"),
    set: audioExportSettings.set,
  }
}
