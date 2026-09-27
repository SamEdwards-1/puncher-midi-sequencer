import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

// How MIDI is exported, a setting of this machine: see ExportSettingsStore.
export function useExportSettings() {
  const { exportSettings } = useStores()
  return {
    voices: useMobxGetter(exportSettings, "voices"),
    excludedCCs: useMobxGetter(exportSettings, "excludedCCs"),
    modulationCCs: useMobxGetter(exportSettings, "modulationCCs"),
    layout: useMobxGetter(exportSettings, "layout"),
    passes: useMobxGetter(exportSettings, "passes"),
    setVoice: exportSettings.setVoice,
    setCC: exportSettings.setCC,
    setCCs: exportSettings.setCCs,
    setModulationCCs: exportSettings.setModulationCCs,
    setLayout: exportSettings.setLayout,
    setPasses: exportSettings.setPasses,
  }
}
