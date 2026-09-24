import { createDefaultPatch, PatchJSON } from "@midiseq/core"
import { beforeEach, describe, expect, it } from "vitest"
import { FakeClock, FakeSink, ManualTicker } from "../test/fakes"
import { OutputRouter } from "./OutputRouter"
import { SequencerPlayer } from "./SequencerPlayer"

// 120 BPM: one beat every 500 ms, one quarter-note voice at half gate
const makePatch = (): PatchJSON => {
  const patch = createDefaultPatch()
  patch.pace = "4th"
  patch.steps[0].notes = [60]
  patch.steps[1].notes = [62]
  patch.voices[0] = {
    ...patch.voices[0],
    enabled: true,
    pace: "4th",
    length: 0.5,
  }
  return patch
}

describe("SequencerPlayer", () => {
  let clock: FakeClock
  let ticker: ManualTicker
  let all: FakeSink
  let voice0: FakeSink
  let player: SequencerPlayer

  const runFor = (ms: number) => {
    const end = clock.time + ms
    while (clock.time < end) {
      clock.time += 25
      ticker.tick()
    }
  }

  beforeEach(() => {
    clock = new FakeClock()
    clock.time = 1000
    ticker = new ManualTicker()
    all = new FakeSink()
    voice0 = new FakeSink()
    const router = new OutputRouter()
    player = new SequencerPlayer(makePatch(), router, {
      now: clock.now,
      ticker,
      seed: 1,
    })
    player.setOutputs({ all: [all], voices: [voice0, null, null, null] })
  })

  it("schedules notes on the beat grid after the start delay", () => {
    player.play()
    runFor(2000)

    // the clock ends at 3000 ms, so the 3050 ms note is already inside the
    // 100 ms lookahead
    const onTimes = all.ofType(0x90).map((message) => message.time)
    expect(onTimes).toEqual([1050, 1550, 2050, 2550, 3050])
    const offTimes = all.ofType(0x80).map((message) => message.time)
    expect(offTimes).toEqual([1300, 1800, 2300, 2800])
    expect(all.ofType(0x90).map((message) => message.data[1])).toEqual([
      60, 62, 60, 62, 60,
    ])
  })

  it("sends each note once, in time order, across overlapping windows", () => {
    player.play()
    runFor(5000)

    for (const sink of [all, voice0]) {
      const times = sink.sent.map((message) => message.time ?? 0)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      // beats land at 1050 + 500k ms; the clock ends at 6000 ms and the
      // lookahead reaches 6100 ms, so k = 0..10
      expect(sink.ofType(0x90)).toHaveLength(11)
    }
  })

  it("never schedules further ahead than the lookahead", () => {
    player.play()
    for (let i = 0; i < 40; i++) {
      clock.time += 25
      ticker.tick()
      const latest = Math.max(...all.sent.map((message) => message.time ?? 0))
      expect(latest).toBeLessThanOrEqual(clock.time + 100)
    }
  })

  it("moves the playhead when each step comes due", () => {
    player.play()
    expect(player.position).toBeNull()
    runFor(75)
    expect(player.position).toBe(0)
    runFor(500)
    expect(player.position).toBe(1)
  })

  it("shows where each voice is when its step comes due, not before", () => {
    player.play()
    expect(player.voiceDots).toBeNull()
    runFor(75)
    expect(player.voiceDots).toEqual([0, 0, 0, 0])
    // the second step is rendered ahead but has not sounded yet
    runFor(400)
    expect(player.voiceDots).toEqual([0, 0, 0, 0])
    // a quarter-note voice has played one dot, the 8th-note voices two
    runFor(100)
    expect(player.voiceDots).toEqual([1, 2, 2, 2])

    player.stop()
    expect(player.voiceDots).toBeNull()
  })

  it("follows each voice to the dot it is on as that dot comes due", () => {
    player.play()
    expect(player.playingDots).toBeNull()
    // the first dot sounds at 1050 ms
    runFor(75)
    expect(player.playingDots).toEqual([0, null, null, null])
    // a quarter-note voice reaches its second dot at 1550, rendered ahead
    runFor(400)
    expect(player.playingDots).toEqual([0, null, null, null])
    runFor(100)
    expect(player.playingDots).toEqual([1, null, null, null])

    player.stop()
    expect(player.playingDots).toBeNull()
  })

  it("follows a tempo change from the current beat", () => {
    player.play()
    runFor(1000)
    player.setPatch({ ...makePatch(), tempo: 60 })
    all.sent.length = 0
    runFor(3000)

    const onTimes = all.ofType(0x90).map((message) => message.time ?? 0)
    const gaps = onTimes.slice(1).map((time, index) => time - onTimes[index])
    expect(gaps.length).toBeGreaterThan(0)
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(1000, 6)
    }
  })

  it("stops the ticker and silences every port on stop", () => {
    player.play()
    runFor(1100)
    player.stop()

    expect(ticker.isRunning).toBe(false)
    expect(player.isPlaying).toBe(false)
    expect(player.position).toBeNull()
    expect(all.clearCount).toBe(1)
    // All Notes Off on 16 channels, now and after the last scheduled message
    expect(all.ofType(0xb0)).toHaveLength(32)
    expect(voice0.ofType(0xb0)).toHaveLength(32)

    const sentAfterStop = all.sent.length
    runFor(1000)
    expect(all.sent).toHaveLength(sentAfterStop)
  })

  it("panics without playing", () => {
    player.panic()
    expect(all.ofType(0xb0)).toHaveLength(32)
    expect(player.isPlaying).toBe(false)
  })

  describe("previewStep", () => {
    // one sequencer step is 1 beat (500 ms); the voice plays 8ths
    const previewPatch = () => {
      const patch = makePatch()
      patch.steps[0].notes = [60, 64]
      patch.voices[0] = {
        ...patch.voices[0],
        pace: "8th",
        rule: "up",
        velocity: 90,
        channel: 4,
      }
      return patch
    }

    it("plays the step through the voices instead of as a chord", () => {
      player.setPatch(previewPatch())
      player.previewStep(0)

      // the arpeggio steps through the notes rather than sounding together
      expect(all.ofType(0x90)).toEqual([
        { data: [0x93, 60, 90], time: 1000 },
        { data: [0x93, 64, 90], time: 1250 },
      ])
      expect(all.ofType(0x80).map((message) => message.time)).toEqual([
        1125, 1375,
      ])
    })

    it("follows a voice's own rhythm pattern", () => {
      const patch = previewPatch()
      patch.voices[0] = {
        ...patch.voices[0],
        pace: "16th",
        patternLength: 2,
        pattern: patch.voices[0].pattern.map((dot, index) => ({
          ...dot,
          on: index % 2 === 0,
        })),
      }
      player.setPatch(patch)
      player.previewStep(0)

      // every other 16th rests, so notes land on the beat and halfway
      expect(all.ofType(0x90).map((message) => message.time)).toEqual([
        1000, 1250,
      ])
    })

    it("stays quiet on an empty step", () => {
      player.setPatch(previewPatch())
      player.previewStep(20)
      expect(all.sent).toHaveLength(0)
    })

    it("keeps to the four notes a step plays", () => {
      const patch = previewPatch()
      // a fifth note, as a file saved before the count was fixed may hold
      patch.steps[0].notes = [48, 55, 60, 64, 72]
      patch.voices[0] = { ...patch.voices[0], pace: "16th" }
      player.setPatch(patch)
      player.previewStep(0)

      // one note per voice, lowest first; the fifth never sounds
      expect(all.ofType(0x90).map((message) => message.data[1])).toEqual([
        48, 55, 60, 64,
      ])
    })

    it("caps how long a slow step sounds", () => {
      const patch = previewPatch()
      // 4 bars would otherwise run for 8 seconds
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)

      const last = Math.max(...all.sent.map((message) => message.time ?? 0))
      expect(last).toBeLessThanOrEqual(1000 + 2000)
    })
  })

  describe("MIDI clock", () => {
    const clockBytesSent = () =>
      all.sent.filter((message) => message.data[0] >= 0xf8)

    it("sends start, 24 ticks to the beat, then stop", () => {
      player.setSendClock(true)
      player.play()
      runFor(1000)

      const sent = clockBytesSent()
      expect(sent[0].data).toEqual([0xfa])
      expect(sent[0].time).toBe(1000)

      const ticks = sent.filter((message) => message.data[0] === 0xf8)
      // the first beat lands at 1050 ms, and a beat is 500 ms at 120 BPM
      expect(ticks[0].time).toBe(1050)
      expect(ticks[24].time).toBeCloseTo(1550, 6)
      // every tick is its own message, evenly spaced
      for (let index = 1; index <= 24; index++) {
        const gap = (ticks[index].time ?? 0) - (ticks[index - 1].time ?? 0)
        expect(gap).toBeCloseTo(500 / 24, 6)
      }

      player.stop()
      expect(clockBytesSent().at(-1)?.data).toEqual([0xfc])
    })

    it("stays quiet unless it is asked for", () => {
      player.play()
      runFor(1000)
      expect(clockBytesSent()).toHaveLength(0)
    })

    it("only goes to the ports taking the whole sequence", () => {
      player.setSendClock(true)
      player.play()
      runFor(500)
      // the voice's own port carries its notes, not the transport
      expect(voice0.sent.some((message) => message.data[0] >= 0xf8)).toBe(false)
    })
  })
})
