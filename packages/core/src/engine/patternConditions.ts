import { PatternCondition, Probability } from "../entities/types"
import { Rng } from "./rng"

export const evalProbability = (probability: Probability, rng: Rng): boolean =>
  probability === 100 || rng.next() * 100 < probability

// pass is how many earlier passes of the pattern have reached this dot, so
// the first loop is pass 0. lastPlayed is whether the voice's dot just before
// this one played a note, null when there was none.
export const evalCondition = (
  condition: PatternCondition,
  pass: number,
  lastPlayed: boolean | null,
): boolean => {
  switch (condition) {
    case "always":
      return true
    // the last loop of every two, three or four
    case "2:2":
      return pass % 2 === 1
    case "3:3":
      return pass % 3 === 2
    case "4:4":
      return pass % 4 === 3
    // once on, once off
    case "1x":
      return pass % 2 === 0
    // twice on, once off
    case "2x":
      return pass % 3 < 2
    // three on, once off
    case "3x":
      return pass % 4 < 3
    case "last":
      return lastPlayed === true
    case "notLast":
      return lastPlayed !== true
  }
}
