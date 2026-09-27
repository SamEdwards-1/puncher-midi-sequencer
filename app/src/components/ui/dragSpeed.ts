// At a crawl a step takes this many pixels, so a single one is easy to land.
const CRAWL_PIXELS = 10
// Mouse speeds, in pixels per millisecond: at or under CRAWL a drag is all
// precision, at or over DASH it reaches as far as it can.
const CRAWL = 0.1
const DASH = 1.5
// A fast drag crosses the whole range in about this many pixels.
const DASH_PIXELS = 150
// How much of the last move's speed carries into the next, so one jittery
// event doesn't leap.
const CARRY = 0.5

/**
 * Steps a pixel of drag is worth at a given speed. Slow is fine and fast is
 * coarse; a short range never needs more than the crawl.
 */
export const stepsPerPixel = (speed: number, steps: number) => {
  const slow = 1 / CRAWL_PIXELS
  const fast = Math.max(slow, steps / DASH_PIXELS)
  const reach = Math.min(1, Math.max(0, (speed - CRAWL) / (DASH - CRAWL)))
  return slow + (fast - slow) * reach * reach
}

export interface DragTravel {
  // how far the drag has gone, in steps, given how far the mouse is from
  // where it went down (up is positive)
  move: (y: number) => number
  // puts the travel back where the value actually is, when it has hit a
  // limit, so turning back moves it at once
  set: (steps: number) => void
}

/**
 * Follows a drag up or down a number, each move adding steps by how fast the
 * mouse went: a slow drag steps by one, a quick one sweeps.
 */
export const dragTravel = (
  steps: number,
  now: () => number = () => performance.now(),
): DragTravel => {
  let lastY = 0
  let lastTime = now()
  let speed = 0
  let travel = 0
  return {
    move: (y) => {
      const time = now()
      const moved = lastY - y
      // two moves in the same millisecond are still some time apart
      const instant = Math.abs(moved) / Math.max(1, time - lastTime)
      speed = speed * CARRY + instant * (1 - CARRY)
      travel += moved * stepsPerPixel(speed, steps)
      lastY = y
      lastTime = time
      return travel
    },
    set: (next) => {
      travel = next
    },
  }
}
