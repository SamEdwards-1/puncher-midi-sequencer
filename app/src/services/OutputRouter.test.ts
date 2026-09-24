import { describe, expect, it } from "vitest"
import { FakeSink } from "../test/fakes"
import { emptyAssignment, OutputRouter } from "./OutputRouter"

const noteOn = (voice: 0 | 1 | 2 | 3, note = 60, channel = 1) => ({
  type: "noteOn" as const,
  beat: 0,
  voice,
  note,
  velocity: 100,
  channel,
})

const noteOff = (voice: 0 | 1 | 2 | 3, note = 60, channel = 1) => ({
  type: "noteOff" as const,
  beat: 0,
  voice,
  note,
  channel,
})

describe("OutputRouter", () => {
  it("sends a voice's notes to its own port and the All port", () => {
    const all = new FakeSink()
    const voice0 = new FakeSink()
    const router = new OutputRouter()
    router.setAssignment(
      { ...emptyAssignment(), all: [all], voices: [voice0, null, null, null] },
      0,
    )

    router.route(noteOn(0), 5)
    router.route(noteOff(0), 9)

    expect(voice0.sent).toEqual([
      { data: [0x90, 60, 100], time: 5 },
      { data: [0x80, 60, 0], time: 9 },
    ])
    expect(all.sent).toEqual(voice0.sent)
  })

  it("de-duplicates the All port but not the voice ports", () => {
    const all = new FakeSink()
    const voice0 = new FakeSink()
    const voice1 = new FakeSink()
    const router = new OutputRouter()
    router.setAssignment(
      { all: [all], voices: [voice0, voice1, null, null] },
      0,
    )

    router.route(noteOn(0), 5)
    router.route(noteOn(1), 5)

    expect(all.ofType(0x90)).toHaveLength(1)
    expect(voice0.ofType(0x90)).toHaveLength(1)
    expect(voice1.ofType(0x90)).toHaveLength(1)
  })

  it("sends only the All stream to a port chosen for both", () => {
    const shared = new FakeSink()
    const router = new OutputRouter()
    router.setAssignment(
      { all: [shared], voices: [shared, null, null, null] },
      0,
    )

    router.route(noteOn(0), 5)
    expect(shared.ofType(0x90)).toHaveLength(1)
  })

  it("routes CCs by their output", () => {
    const all = new FakeSink()
    const voice2 = new FakeSink()
    const router = new OutputRouter()
    router.setAssignment({ all: [all], voices: [null, null, voice2, null] }, 0)

    const cc = {
      type: "cc" as const,
      beat: 0,
      cc: 74,
      value: 10,
      channel: 3,
      source: "step" as const,
    }
    router.route({ ...cc, output: "all" }, 1)
    router.route({ ...cc, output: 2 }, 2)

    expect(all.sent).toEqual([{ data: [0xb2, 74, 10], time: 1 }])
    expect(voice2.sent).toEqual([{ data: [0xb2, 74, 10], time: 2 }])
  })

  it("silences a port that is unassigned", () => {
    const old = new FakeSink()
    const router = new OutputRouter()
    router.setAssignment({ ...emptyAssignment(), all: [old] }, 0)
    router.route(noteOn(0), 5)

    router.setAssignment(emptyAssignment(), 7)
    // the held note is released and every channel gets All Notes Off
    expect(old.ofType(0x80)).toEqual([{ data: [0x80, 60, 0], time: 7 }])
    expect(old.ofType(0xb0)).toHaveLength(16)
  })

  it("panics immediately and again after the last scheduled message", () => {
    const all = new FakeSink()
    const voice0 = new FakeSink()
    const router = new OutputRouter()
    router.setAssignment({ all: [all], voices: [voice0, null, null, null] }, 0)
    router.route(noteOn(0), 5)

    router.panic(10, 120, [noteOff(0)])

    expect(all.clearCount).toBe(1)
    expect(voice0.clearCount).toBe(1)
    for (const sink of [all, voice0]) {
      const times = sink.ofType(0xb0).map((message) => message.time)
      expect(times.filter((time) => time === 10)).toHaveLength(16)
      expect(times.filter((time) => time === 120)).toHaveLength(16)
      expect(sink.ofType(0x80).map((message) => message.time)).toContain(120)
    }
  })
})
