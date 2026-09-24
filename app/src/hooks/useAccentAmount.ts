import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

// How far an accent moves a note's velocity, a setting of this machine.
export function useAccentAmount() {
  const { playbackSettings } = useStores()
  return {
    accentAmount: useMobxGetter(playbackSettings, "accentAmount"),
    setAccentAmount: playbackSettings.setAccentAmount,
  }
}
