import { PatchJSON } from "@midiseq/core"
import { IEqualsComparer } from "mobx"
import { DependencyList } from "react"
import { useMobxGetter, useMobxSelector } from "./useMobxSelector"
import { useStores } from "./useStores"

// The patch is replaced rather than mutated, so reading the reference is
// enough to follow every edit.
export function usePatch(): PatchJSON {
  const { sequencerStore } = useStores()
  return useMobxGetter(sequencerStore, "patch")
}

/**
 * Part of the patch, for a reader that needs less than all of it. An edit
 * shares whatever it leaves alone with the patch before, so a part picked
 * out whole — a step, the voices — keeps its identity until an edit reaches
 * it, and its reader sleeps through every other edit. A selection made
 * afresh each time, such as a few settings in an object, needs `equals`:
 * `comparer.shallow` for that.
 */
export function usePatchSelector<T>(
  select: (patch: PatchJSON) => T,
  deps: DependencyList = [],
  equals?: IEqualsComparer<T>,
): T {
  const { sequencerStore } = useStores()
  return useMobxSelector(
    () => select(sequencerStore.patch),
    [sequencerStore, ...deps],
    equals,
  )
}
