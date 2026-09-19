import { describe, expect, it } from "vitest"
import { createRng } from "./rng"

describe("createRng", () => {
  it("repeats the same sequence for a seed", () => {
    const a = createRng(42)
    const b = createRng(42)
    const first = Array.from({ length: 10 }, () => a.next())
    const second = Array.from({ length: 10 }, () => b.next())
    expect(first).toEqual(second)
  })

  it("differs between seeds and stays in [0, 1)", () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())

    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it("restarts from a new seed", () => {
    const rng = createRng(3)
    const first = rng.next()
    rng.setSeed(3)
    expect(rng.next()).toBe(first)
  })
})
