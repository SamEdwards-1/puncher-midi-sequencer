import { act, renderHook } from "@testing-library/react"
import { makeObservable, observable } from "mobx"
import { describe, expect, it } from "vitest"
import { useMobxGetter, useMobxSelector } from "./useMobxSelector"

class Counter {
  count = 0

  constructor() {
    makeObservable(this, { count: observable })
  }
}

describe("useMobxSelector", () => {
  it("re-renders when the selected observable changes", () => {
    const counter = new Counter()
    const { result } = renderHook(() =>
      useMobxSelector(() => counter.count * 2, [counter]),
    )
    expect(result.current).toBe(0)

    act(() => {
      counter.count = 3
    })
    expect(result.current).toBe(6)
  })
})

describe("useMobxGetter", () => {
  it("reads a property and follows updates", () => {
    const counter = new Counter()
    const { result } = renderHook(() => useMobxGetter(counter, "count"))
    expect(result.current).toBe(0)

    act(() => {
      counter.count = 5
    })
    expect(result.current).toBe(5)
  })
})
