import { Direction, StepIndex } from "../entities/types"
import { Rng } from "./rng"

export interface DirectionState {
  // for the bouncing directions: true while moving forwards
  forward: boolean
}

export const initialDirectionState = (
  direction: Direction,
): DirectionState => ({
  forward: direction !== "bwd" && direction !== "bwdfwd",
})

const firstAbove = (steps: StepIndex[], current: StepIndex) =>
  steps.find((s) => s > current)

const lastBelow = (steps: StepIndex[], current: StepIndex) => {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] < current) {
      return steps[i]
    }
  }
  return undefined
}

// `current` may sit outside `steps`, for example after a jump landed beyond
// the loop range, so the next step is found by position rather than by index.
export const nextStep = (
  direction: Direction,
  current: StepIndex,
  steps: StepIndex[],
  state: DirectionState,
  rng: Rng,
): { step: StepIndex; state: DirectionState } => {
  if (steps.length === 0) {
    return { step: current, state }
  }
  const first = steps[0]
  const last = steps[steps.length - 1]

  switch (direction) {
    case "fwd":
      return { step: firstAbove(steps, current) ?? first, state }
    case "bwd":
      return { step: lastBelow(steps, current) ?? last, state }
    case "fwdbwd":
    case "bwdfwd": {
      if (steps.length === 1) {
        return { step: first, state }
      }
      if (state.forward) {
        const next = firstAbove(steps, current)
        if (next !== undefined) {
          return { step: next, state }
        }
        return {
          step: lastBelow(steps, last) ?? first,
          state: { forward: false },
        }
      }
      const previous = lastBelow(steps, current)
      if (previous !== undefined) {
        return { step: previous, state }
      }
      return {
        step: firstAbove(steps, first) ?? last,
        state: { forward: true },
      }
    }
    case "random":
      return { step: steps[Math.floor(rng.next() * steps.length)], state }
    case "random+": {
      if (steps.length === 1) {
        return { step: first, state }
      }
      const others = steps.filter((s) => s !== current)
      return {
        step: others[Math.floor(rng.next() * others.length)],
        state,
      }
    }
  }
}
