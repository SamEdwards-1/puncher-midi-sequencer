import { describe, expect, it } from "vitest"
import { Direction, StepIndex } from "../entities/types"
import { initialDirectionState, nextStep } from "./direction"
import { createRng } from "./rng"

const walk = (
  direction: Direction,
  steps: StepIndex[],
  count: number,
  start = steps[0],
  seed = 1,
) => {
  const rng = createRng(seed)
  let state = initialDirectionState(direction)
  let current = start
  const visited: StepIndex[] = []
  for (let i = 0; i < count; i++) {
    const result = nextStep(direction, current, steps, state, rng)
    state = result.state
    current = result.step
    visited.push(current)
  }
  return visited
}

describe("nextStep", () => {
  it("goes forwards and wraps", () => {
    expect(walk("fwd", [0, 1, 2], 4)).toEqual([1, 2, 0, 1])
  })

  it("goes backwards and wraps", () => {
    expect(walk("bwd", [0, 1, 2], 4, 2)).toEqual([1, 0, 2, 1])
  })

  it("bounces at both ends", () => {
    expect(walk("fwdbwd", [0, 1, 2], 6)).toEqual([1, 2, 1, 0, 1, 2])
    expect(walk("bwdfwd", [0, 1, 2], 6, 2)).toEqual([1, 0, 1, 2, 1, 0])
  })

  it("skips over gaps left by skipped steps", () => {
    expect(walk("fwd", [0, 3, 7], 4)).toEqual([3, 7, 0, 3])
  })

  it("walks back into range when starting outside it", () => {
    expect(
      nextStep("fwd", 20, [0, 1, 2], { forward: true }, createRng(1)).step,
    ).toBe(0)
    expect(
      nextStep("bwd", 20, [0, 1, 2], { forward: false }, createRng(1)).step,
    ).toBe(2)
  })

  it("random stays in range and random+ never repeats", () => {
    const steps = [0, 1, 2, 3]
    for (const step of walk("random", steps, 50)) {
      expect(steps).toContain(step)
    }

    const visited = walk("random+", steps, 50)
    for (let i = 1; i < visited.length; i++) {
      expect(visited[i]).not.toBe(visited[i - 1])
    }
  })

  it("stays put when only one step is playable", () => {
    expect(walk("random+", [2], 3)).toEqual([2, 2, 2])
    expect(walk("fwdbwd", [2], 3)).toEqual([2, 2, 2])
  })
})
