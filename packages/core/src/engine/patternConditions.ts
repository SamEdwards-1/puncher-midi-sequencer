import { PatternCondition, Probability } from "../entities/types"
import { Rng } from "./rng"

export const evalProbability = (probability: Probability, rng: Rng): boolean =>
  probability === 100 || rng.next() * 100 < probability

// visitCount is how many times this pattern step has already been evaluated.
// lastResult is the previous evaluation result for the same voice.
export const evalCondition = (
  condition: PatternCondition,
  visitCount: number,
  lastResult: boolean | null,
): boolean => {
  switch (condition) {
    case "always":
      return true
    case "2:2":
      return visitCount % 2 === 1
    case "3:3":
      return visitCount % 3 === 2
    case "4:4":
      return visitCount % 4 === 3
    // once on, once off
    case "1x":
      return visitCount % 2 === 0
    // twice on, once off
    case "2x":
      return visitCount % 3 < 2
    // three on, once off
    case "3x":
      return visitCount % 4 < 3
    case "last":
      return lastResult === true
    case "notLast":
      return lastResult !== true
  }
}
