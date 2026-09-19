import { describe, expect, it } from "vitest"
import { JumpRule } from "../entities/types"
import { evalJumpRule } from "./jumpRules"
import { createRng } from "./rng"

const run = (
  rule: JumpRule,
  visits: number,
  lastResult: boolean | null = null,
) =>
  Array.from({ length: visits }, (_, i) =>
    evalJumpRule(rule, i, lastResult, createRng(1)),
  )

describe("evalJumpRule", () => {
  it("always succeeds", () => {
    expect(run({ kind: "always" }, 3)).toEqual([true, true, true])
  })

  it("nx succeeds n times then fails once", () => {
    expect(run({ kind: "times", n: 3 }, 8)).toEqual([
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
    ])
    expect(run({ kind: "times", n: 1 }, 4)).toEqual([true, false, true, false])
  })

  it("n:n succeeds on the nth of every n visits", () => {
    expect(run({ kind: "every", n: 3 }, 6)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ])
    expect(run({ kind: "every", n: 2 }, 4)).toEqual([false, true, false, true])
  })

  it("follows the previous result for last / not last", () => {
    expect(evalJumpRule({ kind: "last" }, 0, true, createRng(1))).toBe(true)
    expect(evalJumpRule({ kind: "last" }, 0, false, createRng(1))).toBe(false)
    expect(evalJumpRule({ kind: "last" }, 0, null, createRng(1))).toBe(false)
    expect(evalJumpRule({ kind: "notLast" }, 0, false, createRng(1))).toBe(true)
    expect(evalJumpRule({ kind: "notLast" }, 0, true, createRng(1))).toBe(false)
    expect(evalJumpRule({ kind: "notLast" }, 0, null, createRng(1))).toBe(true)
  })

  it("passes a chance rule about as often as its percentage", () => {
    const rng = createRng(99)
    let hits = 0
    for (let i = 0; i < 4000; i++) {
      if (evalJumpRule({ kind: "chance", pct: 25 }, i, null, rng)) {
        hits++
      }
    }
    expect(hits / 4000).toBeCloseTo(0.25, 1)
  })
})
