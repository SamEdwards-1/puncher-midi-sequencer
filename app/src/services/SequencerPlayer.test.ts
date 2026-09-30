import {
  addEnvelope,
  createDefaultPatch,
  Engine,
  ModulationTarget,
  PatchJSON,
} from "@midiseq/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  FakeClock,
  FakeSink,
  ManualRoundPreviewer,
  ManualTicker,
} from "../test/fakes"
import { OutputRouter } from "./OutputRouter"
import { RoundJob } from "./RoundPreviewer"
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

  it("accents by the amount it is given", () => {
    const patch = makePatch()
    patch.voices[0].pattern[0] = { ...patch.voices[0].pattern[0], accent: "+" }
    player.setPatch(patch)
    player.setAccentAmount(30)

    // a clicked step, and the sequence playing, both hear it
    player.previewStep(0)
    player.play()
    runFor(100)
    const velocities = all.ofType(0x90).map((message) => message.data[2])
    expect(velocities).toEqual([94, 94])
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

  describe("dispose", () => {
    it("silences what is playing, and plays nothing after", () => {
      player.play()
      runFor(600)
      player.dispose()

      expect(player.isPlaying).toBe(false)
      expect(all.ofType(0xb0)).toHaveLength(32)
      expect(ticker.isRunning).toBe(false)

      const sent = all.sent.length
      player.play()
      player.previewStep(0)
      player.dispose()
      runFor(1000)
      expect(player.isPlaying).toBe(false)
      expect(all.sent).toHaveLength(sent)
    })

    it("silences a clicked step still sounding", () => {
      player.previewStep(0)
      player.dispose()
      expect(all.ofType(0xb0)).toHaveLength(32)
      expect(ticker.isRunning).toBe(false)
    })

    it("sends nothing when nothing is sounding", () => {
      player.dispose()
      expect(all.sent).toEqual([])
    })
  })

  describe("a late tick", () => {
    it("sends what fell due a little late, rather than pausing", () => {
      player.play()
      runFor(925)
      // everything up to 2045 ms is out; the next tick comes 110 ms on
      clock.time = 1945
      ticker.tick()
      clock.time = 2055
      ticker.tick()

      expect(all.ofType(0x90).map((message) => message.time)).toEqual([
        1050, 1550, 2055,
      ])
      expect(player.stats.report()).toMatchObject({
        late: 1,
        maxLate: 5,
        stalls: 0,
      })
    })

    it("pauses the sequence after a stall, then picks up where it was", () => {
      player.play()
      runFor(1000)
      // everything up to 2100 ms is out when the page stalls for two seconds
      clock.time += 2000
      ticker.tick()
      // what was due 0.1 beat into the second step is due now
      expect(player.step).toBe(0)
      expect(player.playhead(0)).toBeCloseTo(0.1)
      runFor(1000)

      // no burst: the beat goes on 500 ms apart from where it paused, and
      // the note sounding across the stall ends as the sequence reaches its
      // end
      expect(all.ofType(0x90).map((message) => message.time)).toEqual([
        1050, 1550, 2050, 4450, 4950,
      ])
      expect(all.ofType(0x80).map((message) => message.time)).toEqual([
        1300, 1800, 4200, 4700,
      ])
      expect(player.stats.report()).toMatchObject({
        late: 0,
        stalls: 1,
        stalled: 1900,
      })
    })

    it("keeps the clock pulsing through a stall rather than bursting", () => {
      player.setSendClock(true)
      player.play()
      runFor(1000)
      clock.time += 2000
      ticker.tick()
      runFor(1000)

      const ticks = all.sent
        .filter((message) => message.data[0] === 0xf8)
        .map((message) => message.time ?? 0)
      const gaps = ticks.slice(1).map((time, index) => time - ticks[index])
      // a 24th of a beat apart, but for the one pause
      const uneven = gaps.filter((gap) => Math.abs(gap - 500 / 24) > 1e-6)
      expect(uneven).toHaveLength(1)
      expect(uneven[0]).toBeGreaterThan(1900)
    })
  })

  describe("a tick's render budget", () => {
    // As busy as it gets at the fastest tempo: every voice at the fastest
    // pace, every dot ratcheted four times, on steps a bar long.
    const busyPatch = (): PatchJSON => {
      const patch = makePatch()
      patch.tempo = 400
      patch.pace = "1bar"
      patch.steps[0].notes = [60, 64, 67]
      patch.steps[1].notes = [62, 65, 69]
      patch.voices = patch.voices.map((voice) => ({
        ...voice,
        enabled: true,
        pace: "32ndT",
        length: 0.1,
        pattern: voice.pattern.map((dot) => ({ ...dot, ratchet: 4 as const })),
      }))
      return patch
    }

    // Plays `patch` from 1000 ms for `ms`, each tick's rendering counted:
    // the player's own, with no rounds played ahead alongside it.
    const playFor = (patch: PatchJSON, ms: number, renderBudget?: number) => {
      const sink = new FakeSink()
      const router = new OutputRouter()
      const played = new SequencerPlayer(patch, router, {
        now: clock.now,
        ticker,
        seed: 1,
        roundPreviewer: new ManualRoundPreviewer().create,
        renderBudget,
      })
      played.setOutputs({ all: [sink], voices: [null, null, null, null] })
      const render = vi.spyOn(Engine.prototype, "render")
      const spent: number[] = []
      const counted = () => {
        spent.push(
          render.mock.results.reduce(
            (sum, result) =>
              sum + (result.type === "return" ? result.value.spent : 0),
            0,
          ),
        )
        render.mockClear()
      }
      clock.time = 1000
      played.play()
      counted()
      const end = clock.time + ms
      while (clock.time < end) {
        clock.time += 25
        ticker.tick()
        counted()
      }
      render.mockRestore()
      played.stop()
      return { sink, spent, stats: played.stats.report() }
    }

    const noteOns = (sink: FakeSink) =>
      sink.ofType(0x90).map(({ data, time }) => ({ data, time: time ?? 0 }))

    // a tick at 400 BPM needs a couple of dozen of the engine's ticks
    it("keeps each tick to its budget", () => {
      const { spent, stats } = playFor(busyPatch(), 2000, 16)
      expect(Math.max(...spent)).toBe(16)
      expect(stats.behind).toBeGreaterThan(0)
    })

    it("sends just the same when a small budget keeps up, a tick later", () => {
      // at 120 BPM a tick needs a few, but the first lookahead more
      const whole = playFor(makePatch(), 3000)
      const small = playFor(makePatch(), 3000, 4)
      expect(small.stats.behind).toBeGreaterThan(0)
      expect(small.stats).toMatchObject({ late: 0, stalls: 0 })
      expect(small.sink.sent).toEqual(whole.sink.sent)
    })

    it("pauses for what it cannot keep up with, rather than rushing or dropping it", () => {
      const whole = playFor(busyPatch(), 3000)
      const starved = playFor(busyPatch(), 3000, 16)
      expect(whole.stats).toMatchObject({ behind: 0, stalls: 0, late: 0 })
      expect(starved.stats.stalls).toBeGreaterThan(0)
      expect(starved.stats.late).toBe(0)

      // the same notes in the same order, only fewer of them in the time
      const played = noteOns(starved.sink)
      const due = noteOns(whole.sink)
      expect(played.length).toBeGreaterThan(0)
      expect(played.length).toBeLessThan(due.length)
      expect(played.map(({ data }) => data)).toEqual(
        due.slice(0, played.length).map(({ data }) => data),
      )
      // and never closer together than they are due, on any channel
      for (const channel of [0, 1, 2, 3]) {
        const gaps = (notes: typeof played) => {
          const times = notes
            .filter(({ data }) => (data[0] & 0x0f) === channel)
            .map(({ time }) => time)
          return times.slice(1).map((time, index) => time - times[index])
        }
        const dueGaps = gaps(due)
        gaps(played).forEach((gap, index) => {
          expect(gap).toBeGreaterThanOrEqual(dueGaps[index] - 1e-6)
        })
      }
    })
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
      runFor(500)

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
      runFor(500)

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
      runFor(500)

      // one note per voice, lowest first; the fifth never sounds
      expect(all.ofType(0x90).map((message) => message.data[1])).toEqual([
        48, 55, 60, 64,
      ])
    })

    it("sounds a slow step all the way through", () => {
      const patch = previewPatch()
      // 4 bars, 8 seconds of 8ths
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)
      runFor(9000)

      const ons = all.ofType(0x90).map((message) => message.time ?? 0)
      expect(ons).toHaveLength(32)
      expect(Math.max(...ons)).toBe(1000 + 7750)
      expect(ticker.isRunning).toBe(false)
    })

    it("sends ahead only as far as the lookahead", () => {
      const patch = previewPatch()
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)

      const last = Math.max(...all.sent.map((message) => message.time ?? 0))
      expect(last).toBeLessThanOrEqual(1000 + 100)
    })

    it("plays a step as the sequence first reaches it", () => {
      const patch = previewPatch()
      // a dotted-8th voice comes to step 1 a quarter of a beat in
      patch.voices[0] = { ...patch.voices[0], pace: "8thD" }
      player.setPatch(patch)
      player.previewStep(1)
      runFor(500)

      expect(all.ofType(0x90).map((message) => message.time)).toEqual([1250])
    })

    it("is cut short by clicking another step, its notes ended", () => {
      const patch = previewPatch()
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)
      runFor(1000)
      player.previewStep(1)
      runFor(9000)

      // step 0 sounds for a second of its 8, and none of it is left hanging
      const step0 = all.sent.filter(
        (message) => message.data[1] === 60 || message.data[1] === 64,
      )
      const ons = step0.filter((message) => (message.data[0] & 0xf0) === 0x90)
      const offs = step0.filter((message) => (message.data[0] & 0xf0) === 0x80)
      expect(Math.max(...ons.map((message) => message.time ?? 0))).toBeLessThan(
        2200,
      )
      expect(offs).toHaveLength(ons.length)
    })

    it("pauses after a stall, as the sequence does", () => {
      const patch = previewPatch()
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)
      // sent up to 2100 ms when the page stalls for three seconds
      runFor(1000)
      clock.time += 3000
      ticker.tick()
      // 1100 ms into its 8 seconds, where it paused
      expect(player.playhead(0)).toBeCloseTo(1100 / 8000)
      runFor(1000)

      const ons = all.ofType(0x90).map((message) => message.time ?? 0)
      const gaps = ons.slice(1).map((time, index) => time - ons[index])
      // 8ths 250 ms apart, but for the one pause
      expect(gaps.filter((gap) => gap !== 250)).toEqual([250 + 2900])
      expect(player.stats.report()).toMatchObject({ stalls: 1, late: 0 })
    })

    it("stops sending once silenced", () => {
      const patch = previewPatch()
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)
      runFor(1000)
      player.panic()
      const sent = all.ofType(0x90).length
      runFor(2000)

      expect(all.ofType(0x90)).toHaveLength(sent)
      expect(ticker.isRunning).toBe(false)
    })
  })

  describe("roundNotes", () => {
    // each step is a beat; a dotted-8th voice comes to it at a different
    // point each time round
    const driftingPatch = () => {
      const patch = makePatch()
      patch.voices[0] = { ...patch.voices[0], pace: "8thD" }
      return patch
    }

    it("are the notes the sounding step plays this time round", () => {
      player.setPatch(driftingPatch())
      player.play()
      // step 0 lands at 1050 ms, and again at 2050 ms, 2 beats on
      runFor(100)
      expect(player.roundNotes?.step).toBe(0)
      expect(player.roundNotes?.notes.map((note) => note.start)).toEqual([
        0, 0.75,
      ])

      runFor(1000)
      expect(player.roundNotes?.step).toBe(0)
      // its only dot, at beat 2.25, falls a quarter of the way in
      expect(player.roundNotes?.notes.map((note) => note.start)).toEqual([0.25])
      expect(all.ofType(0x90).map((message) => message.time)).toContain(2175)

      player.stop()
      expect(player.roundNotes).toBeNull()
    })

    it("follow an edit made while the step sounds", () => {
      player.setPatch(driftingPatch())
      player.play()
      runFor(100)
      const patch = driftingPatch()
      patch.steps[0].notes = [67]
      player.setPatch(patch)

      expect(player.roundNotes?.notes.map((note) => note.note)).toEqual([
        67, 67,
      ])
    })

    describe("played ahead in their own time", () => {
      let previewer: ManualRoundPreviewer
      let deferred: SequencerPlayer

      beforeEach(() => {
        previewer = new ManualRoundPreviewer()
        deferred = new SequencerPlayer(driftingPatch(), new OutputRouter(), {
          now: clock.now,
          ticker,
          seed: 1,
          roundPreviewer: previewer.create,
        })
        deferred.setOutputs({ all: [all], voices: [voice0, null, null, null] })
      })

      it("wait on what is due, and show once played", () => {
        deferred.play()
        // the first note is out before its round has been played ahead
        expect(all.ofType(0x90).map((message) => message.time)).toEqual([1050])
        expect(previewer.wakes).toBe(1)
        runFor(100)
        expect(deferred.step).toBe(0)
        expect(deferred.roundNotes).toBeNull()

        const job = previewer.take()
        expect(job).not.toBeNull()
        previewer.finish(job as RoundJob)
        expect(deferred.roundNotes?.notes.map((note) => note.start)).toEqual([
          0, 0.75,
        ])
        expect(previewer.take()).toBeNull()
      })

      it("keep to the latest edit, whichever is played first", () => {
        deferred.play()
        runFor(100)
        const before = previewer.take() as RoundJob
        const patch = driftingPatch()
        patch.steps[0].notes = [67]
        deferred.setPatch(patch)
        expect(previewer.wakes).toBe(2)
        const after = previewer.take() as RoundJob
        expect(after.id).toBe(before.id)
        expect(after.revision).toBeGreaterThan(before.revision)

        previewer.finish(after)
        previewer.finish(before)
        expect(deferred.roundNotes?.notes.map((note) => note.note)).toEqual([
          67, 67,
        ])
      })

      it("forget a round gone by, and play the sounding one first", () => {
        deferred.play()
        runFor(100)
        const gone = previewer.take() as RoundJob
        // step 1 lands at 1550 ms, then step 0 again at 2050 ms
        runFor(1000)
        previewer.finish(gone)
        expect(deferred.roundNotes).toBeNull()

        previewer.finish(previewer.take() as RoundJob)
        expect(deferred.roundNotes?.step).toBe(0)
        expect(deferred.roundNotes?.notes.map((note) => note.start)).toEqual([
          0.25,
        ])
      })
    })
  })

  describe("playhead", () => {
    it("is nowhere while nothing sounds", () => {
      expect(player.playhead(0)).toBeNull()
      expect(player.sounding()).toBe(false)
    })

    it("crosses each step as the sequence plays it", () => {
      player.play()
      // step 1 lands at 1050 ms and lasts a beat, 500 ms
      runFor(300)
      expect(player.step).toBe(0)
      expect(player.playhead(0)).toBeCloseTo(0.5)
      expect(player.playhead(1)).toBeNull()

      runFor(500)
      expect(player.step).toBe(1)
      expect(player.playhead(1)).toBeCloseTo(0.5)
      expect(player.playhead(0)).toBeNull()

      player.stop()
      expect(player.step).toBeNull()
      expect(player.playhead(1)).toBeNull()
    })

    it("crosses a held step again each time round", () => {
      player.play()
      runFor(300)
      player.setAction("hold", true)

      // step 1 lands at 1050 ms; Hold keeps it at 1550 and again at 2050
      runFor(500)
      expect(player.step).toBe(0)
      expect(player.playhead(0)).toBeCloseTo(0.5)
      runFor(500)
      expect(player.step).toBe(0)
      expect(player.playhead(0)).toBeCloseTo(0.5)
      // recording still reads the held step as played out
      expect(player.stepProgress()?.time).toBe(1)

      // let go, the round in progress plays out and step 2 lands at 2550
      player.setAction("hold", false)
      runFor(200)
      expect(player.step).toBe(0)
      expect(player.playhead(0)).toBeCloseTo(0.9)
      runFor(300)
      expect(player.step).toBe(1)
      expect(player.playhead(1)).toBeCloseTo(0.5)
    })

    it("crosses a clicked step as it sounds, and is gone once it has", () => {
      player.previewStep(1)
      expect(player.playhead(1)).toBe(0)
      expect(player.playhead(0)).toBeNull()

      clock.time += 250
      expect(player.playhead(1)).toBeCloseTo(0.5)
      expect(player.sounding()).toBe(true)

      clock.time += 250
      expect(player.playhead(1)).toBeNull()
      expect(player.sounding()).toBe(false)
    })

    it("crosses a slow step all the way", () => {
      const patch = makePatch()
      // 4 bars, 8 seconds
      patch.pace = "4bar"
      player.setPatch(patch)
      player.previewStep(0)

      clock.time += 6000
      expect(player.playhead(0)).toBeCloseTo(3 / 4)
      clock.time += 2000
      expect(player.playhead(0)).toBeNull()
    })

    it("goes with the sound when it is stopped", () => {
      player.previewStep(0)
      player.panic()
      expect(player.playhead(0)).toBeNull()
      expect(player.sounding()).toBe(false)
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

  describe("modulation", () => {
    const PACE: ModulationTarget = { kind: "voice", voice: 0, setting: "pace" }
    // Voice 1's pace from a 4th to a 16th, on CC 3, which the second step
    // ramps from the one to the other across its beat; that step sends
    // brightness as well.
    const modulated = () => {
      let patch: PatchJSON = {
        ...makePatch(),
        modulations: [{ target: PACE, cc: 3, from: "4th", to: "16th" }],
      }
      patch = addEnvelope(patch, 1, {
        cc: 3,
        channel: 1,
        shape: "ramps",
        points: [
          { time: 0, value: 0 },
          { time: 1, value: 127 },
        ],
      })
      return addEnvelope(patch, 1, {
        cc: 74,
        channel: 1,
        points: [{ time: 0, value: 20 }],
      })
    }
    const ccsSent = () => all.ofType(0xb0).map((message) => message.data[1])

    it("shows the settings the sounding step drives, as its envelopes have them now", () => {
      player.setPatch(modulated())
      expect(player.modulated).toBeNull()
      player.play()
      // the first step, which drives nothing
      runFor(75)
      expect(player.modulated).toEqual([])
      // the second lands at 1550 ms: a twentieth of the way along its ramp
      runFor(500)
      expect(player.modulated).toEqual([
        { target: PACE, cc: 3, ccValue: 6, value: "4th" },
      ])
      // and past halfway, an 8th
      runFor(250)
      expect(player.modulated).toEqual([
        { target: PACE, cc: 3, ccValue: 70, value: "8th" },
      ])

      player.stop()
      expect(player.modulated).toBeNull()
    })

    it("sends the CCs driving settings unless told not to, and the rest either way", () => {
      player.setPatch(modulated())
      player.play()
      runFor(1000)
      expect(ccsSent()).toContain(3)
      expect(ccsSent()).toContain(74)
      player.stop()

      all.sent.length = 0
      player.setSendModulationCCs(false)
      player.play()
      runFor(1000)
      expect(ccsSent()).not.toContain(3)
      expect(ccsSent()).toContain(74)
      // the setting still follows its CC
      expect(player.modulated).toMatchObject([{ target: PACE }])
      player.stop()

      // nor does a clicked step send them
      all.sent.length = 0
      player.previewStep(1)
      expect(ccsSent()).toEqual([74])
    })
  })
})
