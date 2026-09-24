import { describe, expect, it } from "vitest"
import { ClockFollower } from "./ClockFollower"

// 24 ticks a beat: 20.833 ms a tick is 120 BPM, 10.417 ms is 240
const tickMs = (bpm: number) => 60000 / (bpm * 24)

const feed = (
  follower: ClockFollower,
  clock: { time: number },
  bpm: number,
  ticks: number,
) => {
  let last: number | null = null
  for (let i = 0; i < ticks; i++) {
    clock.time += tickMs(bpm)
    last = follower.onTick()
  }
  return last
}

describe("ClockFollower", () => {
  const setup = () => {
    const clock = { time: 1000 }
    return { clock, follower: new ClockFollower(() => clock.time) }
  }

  it("says nothing until it has heard enough ticks", () => {
    const { clock, follower } = setup()
    expect(feed(follower, clock, 120, 6)).toBeNull()
  })

  it("reads the tempo a steady clock is running at", () => {
    const { clock, follower } = setup()
    expect(feed(follower, clock, 120, 24)).toBe(120)
  })

  it("follows a tempo that changes", () => {
    const { clock, follower } = setup()
    expect(feed(follower, clock, 100, 24)).toBe(100)
    // within a beat of the change it has caught up
    expect(feed(follower, clock, 140, 24)).toBe(140)
  })

  it("treats a long gap as a stop rather than a slow tempo", () => {
    const { clock, follower } = setup()
    expect(feed(follower, clock, 120, 24)).toBe(120)

    clock.time += 5000
    expect(follower.onTick()).toBeNull()
    // and it takes a fresh run of ticks to say anything again
    expect(feed(follower, clock, 120, 6)).toBeNull()
    expect(feed(follower, clock, 120, 12)).toBe(120)
  })

  it("keeps to the range the tempo field allows", () => {
    const { clock, follower } = setup()
    // a clock running far faster than the field goes
    expect(feed(follower, clock, 1250, 24)).toBe(400)
  })

  it("starts over when it is reset", () => {
    const { clock, follower } = setup()
    feed(follower, clock, 120, 24)
    follower.reset()
    expect(feed(follower, clock, 120, 6)).toBeNull()
  })
})
