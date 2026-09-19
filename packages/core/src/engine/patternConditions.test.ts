import { describe, expect, it } from "vitest"
import { PatternCondition } from "../entities/types"
import { evalCondition, evalProbability } from "./patternConditions"
import { createRng } from "./rng"

const run = (condition: PatternCondition, count: number) =>
  Array.from({ length: count }, (_, i) => evalCondition(condition, i, null))

describe("evalCondition", () => {
  it("handles the nth-of-n conditions", () => {
    expect(run("always", 3)).toEqual([true, true, true])
    expect(run("2:2", 4)).toEqual([false, true, false, true])
    expect(run("3:3", 6)).toEqual([false, false, true, false, false, true])
    expect(run("4:4", 4)).toEqual([false, false, false, true])
  })

  it("handles the on/off conditions", () => {
    expect(run("1x", 4)).toEqual([true, false, true, false])
    expect(run("2x", 6)).toEqual([true, true, false, true, true, false])
    expect(run("3x", 4)).toEqual([true, true, true, false])
  })

  it("follows the voice's previous result", () => {
    expect(evalCondition("last", 0, true)).toBe(true)
    expect(evalCondition("last", 0, null)).toBe(false)
    expect(evalCondition("notLast", 0, false)).toBe(true)
    expect(evalCondition("notLast", 0, true)).toBe(false)
  })
})

describe("evalProbability", () => {
  it("always passes at 100%", () => {
    const rng = createRng(5)
    for (let i = 0; i < 50; i++) {
      expect(evalProbability(100, rng)).toBe(true)
    }
  })

  it("passes about as often as its percentage", () => {
    const rng = createRng(11)
    let hits = 0
    for (let i = 0; i < 4000; i++) {
      if (evalProbability(75, rng)) {
        hits++
      }
    }
    expect(hits / 4000).toBeCloseTo(0.75, 1)
  })
})
