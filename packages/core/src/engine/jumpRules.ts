import { JumpRule } from "../entities/types"
import { Rng } from "./rng"

// visitCount is how many times this step's jump has already been evaluated.
// lastResult is the result of the most recent jump evaluation anywhere in the
// sequence, or null when none has happened yet.
export const evalJumpRule = (
  rule: JumpRule,
  visitCount: number,
  lastResult: boolean | null,
  rng: Rng,
): boolean => {
  switch (rule.kind) {
    case "always":
      return true
    // nx: succeed n times, then fail once
    case "times":
      return visitCount % (rule.n + 1) < rule.n
    // n:n: succeed on the nth of every n visits
    case "every":
      return visitCount % rule.n === rule.n - 1
    case "chance":
      return rng.next() * 100 < rule.pct
    case "last":
      return lastResult === true
    case "notLast":
      return lastResult !== true
  }
}
