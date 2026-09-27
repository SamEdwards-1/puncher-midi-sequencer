import {
  ModulatedSetting,
  ModulationTarget,
  sameModulationValue,
  sameTarget,
} from "@midiseq/core"
import { useMobxSelector } from "./useMobxSelector"
import { useStores } from "./useStores"

const sameSetting = (
  a: ModulatedSetting | undefined,
  b: ModulatedSetting | undefined,
) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.cc === b.cc &&
    a.ccValue === b.ccValue &&
    sameModulationValue(a.value, b.value))

/**
 * A setting as the sounding step's envelope has it right now: undefined
 * while stopped, and on a step that doesn't modulate it.
 */
export function useLiveModulation(
  target: ModulationTarget,
): ModulatedSetting | undefined {
  const { player } = useStores()
  const key = JSON.stringify(target)
  return useMobxSelector(
    () => player.modulated?.find((each) => sameTarget(each.target, target)),
    [player, key],
    sameSetting,
  )
}
