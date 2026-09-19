import { IEqualsComparer, reaction } from "mobx"
import { DependencyList, useCallback } from "react"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector"

type Selector<T> = () => T

export function useMobxSelector<T>(
  selector: Selector<T>,
  deps: DependencyList,
  equals: IEqualsComparer<T> = Object.is,
): T {
  return useSyncExternalStoreWithSelector(
    useCallback(
      (onStoreChange: () => void) =>
        reaction(selector, onStoreChange, {
          fireImmediately: true,
          equals,
        }),
      // biome-ignore lint/correctness/useExhaustiveDependencies: caller supplies deps
      deps,
    ),
    selector,
    undefined,
    useCallback((x: T) => x, []),
    equals,
  )
}

export function useMobxGetter<T, K extends keyof T>(
  store: T,
  prop: K,
  equals?: IEqualsComparer<T[K]>,
): T[K]
export function useMobxGetter<T, K extends keyof T>(
  store: T | undefined,
  prop: K,
  equals?: IEqualsComparer<T[K] | undefined>,
): T[K] | undefined
export function useMobxGetter<T, K extends keyof T>(
  store: T | undefined,
  prop: K,
  equals?: IEqualsComparer<T[K] | undefined>,
): T[K] | undefined {
  return useMobxSelector(() => store?.[prop], [store], equals)
}

export function useMobxSetter<T, K extends keyof T>(
  store: T,
  prop: K,
): (value: T[K]) => void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: prop is static per call site
  return useCallback(
    (value: T[K]) => {
      store[prop] = value
    },
    [store],
  )
}
