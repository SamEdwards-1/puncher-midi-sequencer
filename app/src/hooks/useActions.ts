import { EngineActions } from "@midiseq/core"
import { atom, useAtom } from "jotai"
import { useEffect } from "react"
import { useMobxGetter } from "./useMobxSelector"
import { useSelectedVoice } from "./useSequencerView"
import { useStores } from "./useStores"

// With latch on, the action buttons stay on until clicked again instead of
// only lasting while held.
const latchActionsAtom = atom(false)

export function useLatchActions() {
  return useAtom(latchActionsAtom)
}

export function useActions() {
  const { player } = useStores()
  const actions = useMobxGetter(player, "actions")

  return {
    actions,
    setAction: player.setAction,
    toggleAction: (action: keyof EngineActions) =>
      player.setAction(action, !actions[action]),
  }
}

// Sync follows the selected voice, so the player hears of every change.
export function useSelectedVoiceSync() {
  const { player } = useStores()
  const [voice] = useSelectedVoice()
  useEffect(() => player.setSelectedVoice(voice), [player, voice])
}
