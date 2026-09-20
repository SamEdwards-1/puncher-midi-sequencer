import { PatchJSON } from "@midiseq/core"
import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

// The patch is replaced rather than mutated, so reading the reference is
// enough to follow every edit.
export function usePatch(): PatchJSON {
  const { sequencerStore } = useStores()
  return useMobxGetter(sequencerStore, "patch")
}
