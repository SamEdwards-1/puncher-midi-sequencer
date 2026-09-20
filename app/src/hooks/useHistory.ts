import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

export function useHistory() {
  const { history } = useStores()

  return {
    get canUndo() {
      return useMobxGetter(history, "canUndo")
    },
    get canRedo() {
      return useMobxGetter(history, "canRedo")
    },
    undo: history.undo,
    redo: history.redo,
  }
}
