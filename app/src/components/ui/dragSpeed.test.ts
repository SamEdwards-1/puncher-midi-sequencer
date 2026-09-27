import { describe, expect, it } from "vitest"
import { dragTravel, stepsPerPixel } from "./dragSpeed"

// A drag that moves `pixels` up in each move, `every` milliseconds apart.
const drag = (steps: number, moves: number, pixels: number, every: number) => {
  let time = 0
  const travel = dragTravel(steps, () => time)
  let result = 0
  for (let move = 1; move <= moves; move++) {
    time += every
    result = travel.move(-move * pixels)
  }
  return result
}

describe("stepsPerPixel", () => {
  it("takes ten pixels a step at a crawl, whatever the range", () => {
    expect(stepsPerPixel(0, 127)).toBe(0.1)
    expect(stepsPerPixel(0.1, 380)).toBe(0.1)
  })

  it("grows with speed, to the whole range in 150 pixels", () => {
    expect(stepsPerPixel(0.5, 127)).toBeGreaterThan(0.1)
    expect(stepsPerPixel(0.5, 127)).toBeLessThan(stepsPerPixel(1, 127))
    expect(stepsPerPixel(1.5, 150)).toBe(1)
    expect(stepsPerPixel(10, 150)).toBe(1)
  })

  it("never outpaces the crawl on a short range", () => {
    expect(stepsPerPixel(10, 8)).toBe(0.1)
  })
})

describe("dragTravel", () => {
  it("steps by one for a slow ten pixels", () => {
    // a pixel every 20ms is 0.05px/ms, a crawl
    expect(Math.round(drag(127, 10, 1, 20))).toBe(1)
  })

  it("sweeps much further for the same distance moved quickly", () => {
    const slow = drag(127, 10, 10, 200)
    const fast = drag(127, 10, 10, 4)
    expect(slow).toBeCloseTo(10)
    expect(fast).toBeGreaterThan(50)
  })

  it("goes down as the mouse goes down", () => {
    let time = 0
    const travel = dragTravel(127, () => time)
    time += 200
    expect(travel.move(20)).toBeCloseTo(-2)
  })

  it("carries on from where it is set", () => {
    let time = 0
    const travel = dragTravel(127, () => time)
    time += 200
    travel.move(-40)
    travel.set(0)
    time += 200
    expect(travel.move(-50)).toBeCloseTo(1)
  })
})
