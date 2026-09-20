import { EngineActions } from "@midiseq/core"
import { atom, useAtom } from "jotai"
import { useMobxGetter } from "./useMobxSelector"
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
