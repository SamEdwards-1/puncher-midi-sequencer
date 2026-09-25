import { createDefaultMIDIFilter, createDefaultPatch } from "@midiseq/core"
import { beforeEach, describe, expect, it } from "vitest"
import { SequencerStore } from "../stores/SequencerStore"
import { MIDIInput } from "./MIDIInput"
import { MIDIRecorder } from "./MIDIRecorder"
import type { StepProgress } from "./SequencerPlayer"

const noteOn = (note: number, channel = 1) => [0x90 + channel - 1, note, 100]
const noteOff = (note: number, channel = 1) => [0x80 + channel - 1, note, 0]
const cc = (number: number, value: number, channel = 1) => [
  0xb0 + channel - 1,
  number,
  value,
]

describe("MIDIRecorder", () => {
  let store: SequencerStore
  let input: MIDIInput
  let recorder: MIDIRecorder

  const play = (...messages: number[][]) => {
    for (const message of messages) {
      input.handleMessage(message)
    }
  }

  beforeEach(() => {
    store = new SequencerStore()
    store.patch = createDefaultPatch()
    input = new MIDIInput()
    recorder = new MIDIRecorder(store, input)
    recorder.setRecording(true)
  })

  it("fills a step with one note per voice before moving on", () => {
    play(noteOn(60), noteOff(60), noteOn(64), noteOff(64))

    // two of the four are down, so the step is still the target
    expect(store.patch.steps[0].notes).toEqual([60, 64])
    expect(recorder.target).toBe(0)

    play(noteOn(67), noteOff(67), noteOn(71), noteOff(71))

    expect(store.patch.steps[0].notes).toEqual([60, 64, 67, 71])
    expect(recorder.target).toBe(1)
  })

  it("takes a chord as the notes it holds", () => {
    play(
      noteOn(60),
      noteOn(64),
      noteOn(67),
      noteOff(64),
      noteOff(60),
      noteOff(67),
    )

    expect(store.patch.steps[0].notes).toEqual([60, 64, 67])
    expect(recorder.target).toBe(0)
  })

  it("fills the step as each note is played, without waiting for release", () => {
    play(noteOn(60))
    expect(store.patch.steps[0].notes).toEqual([60])

    play(noteOn(64))
    expect(store.patch.steps[0].notes).toEqual([60, 64])
  })

  it("fills to Step Notes when it asks for fewer than four", () => {
    store.patch = { ...store.patch, maxNotesPerStep: 2 }
    play(noteOn(60), noteOn(64), noteOn(67))

    expect(store.patch.steps[0].notes).toEqual([60, 64])
    expect(store.patch.steps[1].notes).toEqual([67])
    expect(recorder.target).toBe(1)
  })

  it("carries what won't fit onto the next step", () => {
    play(noteOn(67), noteOn(60), noteOn(64), noteOn(71), noteOn(72))

    expect(store.patch.steps[0].notes).toEqual([60, 64, 67, 71])
    expect(store.patch.steps[1].notes).toEqual([72])
    expect(recorder.target).toBe(1)
  })

  it("waits for four however often a pitch is repeated", () => {
    // a step keeps each pitch once, so a repeat adds nothing to it
    play(noteOn(60), noteOff(60), noteOn(60), noteOff(60))

    expect(store.patch.steps[0].notes).toEqual([60])
    expect(store.patch.steps[1].notes).toEqual([])
    expect(recorder.target).toBe(0)
  })

  it("replaces the notes already on a step", () => {
    store.patch = {
      ...store.patch,
      steps: store.patch.steps.map((step, index) =>
        index === 0 ? { ...step, notes: [40, 41] } : step,
      ),
    }
    play(noteOn(60), noteOff(60))
    expect(store.patch.steps[0].notes).toEqual([60])
  })

  it("starts a fresh step after the take is stopped and armed again", () => {
    play(noteOn(60), noteOff(60))
    recorder.setRecording(false)
    recorder.setRecording(true)
    play(noteOn(64), noteOff(64))

    expect(store.patch.steps[0].notes).toEqual([64])
  })

  it("ignores input until recording is armed", () => {
    recorder.setRecording(false)
    play(noteOn(60), noteOff(60))
    expect(store.patch.steps[0].notes).toEqual([])
  })

  it("records onto the step that was picked", () => {
    recorder.setTarget(5)
    play(noteOn(60), noteOn(64), noteOn(67), noteOn(71))

    expect(store.patch.steps[5].notes).toEqual([60, 64, 67, 71])
    expect(recorder.target).toBe(6)
  })

  it("wraps around the end of the grid", () => {
    store.patch = { ...store.patch, size: "small" }
    recorder.setTarget(15)
    play(noteOn(60), noteOn(64), noteOn(67), noteOn(71))

    expect(recorder.target).toBe(0)
  })

  it("keeps a chord that was still held when recording stopped", () => {
    play(noteOn(60), noteOn(64))
    recorder.setRecording(false)

    expect(store.patch.steps[0].notes).toEqual([60, 64])
  })

  describe("controllers", () => {
    // where the sequence is; null is stopped
    let at: StepProgress | null
    const playingAt = (step: number, time: number, lengthBeats = 4) => {
      at = { step, time, lengthBeats }
    }
    const envelopes = (step: number) => store.patch.steps[step].envelopes
    // New envelopes step; these steps get one that ramps, empty, for CC 74
    // on channel 1 to be recorded into.
    const ramping = (...steps: number[]) => {
      for (const step of steps) {
        store.patch.steps[step].envelopes = [
          { id: 100 + step, cc: 74, channel: 1, shape: "ramps", points: [] },
        ]
      }
    }

    beforeEach(() => {
      at = null
      // a four-beat step, so a stored time is a fraction of it times four
      store.patch = { ...store.patch, pace: "1bar" }
      input = new MIDIInput()
      recorder = new MIDIRecorder(
        store,
        input,
        () => {},
        () => at,
      )
      recorder.setRecording(true)
    })

    describe("while stopped", () => {
      it("sets the target step's value on landing", () => {
        recorder.setTarget(3)
        play(cc(74, 90, 2))

        expect(envelopes(3)).toMatchObject([
          { cc: 74, channel: 2, points: [{ time: 0, value: 90 }] },
        ])
      })

      it("collects every value turned to, each holding an even share", () => {
        play(cc(74, 10), cc(74, 80), cc(74, 20))

        expect(envelopes(0)).toMatchObject([{ shape: "steps" }])
        expect(envelopes(0)[0].points.map(({ value }) => value)).toEqual([
          10, 80, 20,
        ])
        expect(envelopes(0)[0].points.map(({ time }) => time)).toEqual(
          [0, 4 / 3, 8 / 3].map((time) => Math.round(time * 1e9) / 1e9),
        )
      })

      it("ramped, collects every value turned to, spread across the step", () => {
        ramping(0)
        play(cc(74, 10), cc(74, 80), cc(74, 20))

        expect(envelopes(0)).toHaveLength(1)
        expect(envelopes(0)[0].points).toEqual([
          { time: 0, value: 10 },
          { time: 2, value: 80 },
          { time: 4, value: 20 },
        ])
      })

      it("turns a sweep into a ramp across the step, however long it took", () => {
        ramping(0)
        for (let value = 0; value <= 127; value++) {
          play(cc(74, value))
        }
        expect(envelopes(0)[0].points).toEqual([
          { time: 0, value: 0 },
          { time: 4, value: 127 },
        ])
      })

      it("replaces what the step held with the first value of a take", () => {
        play(cc(74, 10), cc(74, 20))
        recorder.setRecording(false)
        recorder.setRecording(true)
        play(cc(74, 90))

        expect(envelopes(0)[0].points).toEqual([{ time: 0, value: 90 }])
      })

      it("starts a new collection on a newly picked step", () => {
        ramping(0, 1)
        play(cc(74, 10), cc(74, 20))
        recorder.setTarget(1)
        play(cc(74, 90))

        expect(envelopes(0)[0].points).toEqual([
          { time: 0, value: 10 },
          { time: 4, value: 20 },
        ])
        expect(envelopes(1)[0].points).toEqual([{ time: 0, value: 90 }])
      })

      it("writes into the step's envelope for that CC and channel", () => {
        store.patch.steps[0].envelopes = [
          {
            id: 1,
            cc: 74,
            channel: 1,
            points: [
              { time: 0, value: 0 },
              { time: 4, value: 127 },
            ],
          },
        ]
        play(cc(74, 50), cc(74, 60, 2), cc(7, 100))

        // the same CC on another channel, or another CC, is its own envelope
        expect(
          envelopes(0).map(({ cc, channel, points }) => ({
            cc,
            channel,
            points,
          })),
        ).toEqual([
          { cc: 74, channel: 1, points: [{ time: 0, value: 50 }] },
          { cc: 74, channel: 2, points: [{ time: 0, value: 60 }] },
          { cc: 7, channel: 1, points: [{ time: 0, value: 100 }] },
        ])
      })

      it("leaves a rest a rest, since a rest still plays its envelopes", () => {
        store.patch.steps[0].state = "rest"
        play(cc(74, 90))
        expect(store.patch.steps[0].state).toBe("rest")
      })
    })

    describe("while playing", () => {
      it("writes a sweep where it is heard, stepping as the knob did", () => {
        // a knob turned from 0 to 10 across the second half of step 5
        for (let index = 0; index <= 10; index++) {
          playingAt(5, 0.5 + index / 48)
          play(cc(74, index))
        }

        const [envelope] = envelopes(5)
        expect(envelope).toMatchObject({ cc: 74, channel: 1, shape: "steps" })
        // a point where each value arrived, the last holding to the end
        expect(envelope.points).toHaveLength(11)
        expect(envelope.points[0]).toEqual({ time: 2, value: 0 })
        expect(envelope.points[10].value).toBe(10)
        expect(envelope.points[10].time).toBeCloseTo(2 + 10 / 12)
      })

      it("ramped, writes a sweep where it is heard, holding the last value", () => {
        ramping(5)
        // a knob turned from 0 to 100 across the second half of step 5
        for (let index = 0; index <= 24; index++) {
          playingAt(5, 0.5 + index / 48)
          play(cc(74, Math.round((index / 24) * 100)))
        }

        const [envelope] = envelopes(5)
        expect(envelope).toMatchObject({ cc: 74, channel: 1 })
        // a steady sweep thins to its ends
        expect(envelope.points).toEqual([
          { time: 2, value: 0 },
          { time: 4, value: 100 },
        ])
        // the step being recorded onto for notes is not moved
        expect(recorder.target).toBe(0)
      })

      it("keeps the shape of a hand-turned sweep, not its jitter", () => {
        ramping(7)
        // a knob turned steadily, its messages arriving early and late
        const played: [number, number][] = []
        for (let index = 0; index <= 48; index++) {
          const late = index % 2 === 0 ? 0.4 : -0.4
          const time = Math.min(1, Math.max(0, (index + late) / 48))
          played.push([time, index * 2])
          playingAt(7, time)
          play(cc(74, index * 2))
        }

        const { points } = envelopes(7)[0]
        // a staircase of handles at the lossless tolerance; its ends here
        expect(points.length).toBeLessThanOrEqual(3)
        // and nothing played is more than two away from what comes back
        for (const [fraction, sent] of played) {
          const time = fraction * 4
          const before = points.filter((point) => point.time <= time).at(-1)
          const after = points.find((point) => point.time > time)
          const back =
            before === undefined
              ? points[0].value
              : after === undefined
                ? before.value
                : before.value +
                  ((after.value - before.value) * (time - before.time)) /
                    (after.time - before.time)
          expect(Math.abs(Math.round(back) - sent)).toBeLessThanOrEqual(2)
        }
      })

      it("keeps what came before the knob moved", () => {
        store.patch.steps[2].envelopes = [
          {
            id: 1,
            cc: 74,
            channel: 1,
            points: [
              { time: 0, value: 20 },
              { time: 4, value: 20 },
            ],
          },
        ]
        playingAt(2, 0.5)
        play(cc(74, 100))

        // flat at 20 until the moment it was touched, then 100 to the end
        expect(envelopes(2)[0].points).toEqual([
          { time: 0, value: 20 },
          { time: 2, value: 20 },
          { time: 2, value: 100 },
        ])
      })

      it("puts a burst inside one read of the engine down as one point", () => {
        // 1/48 of a beat on a four-beat step is 1/192 of the step
        playingAt(0, 0.1)
        play(cc(74, 10))
        playingAt(0, 0.1 + 1 / 1000)
        play(cc(74, 11))

        expect(envelopes(0)[0].points).toHaveLength(1)
        expect(envelopes(0)[0].points[0].value).toBe(11)
      })

      it("starts over on the next step, leaving the last one as played", () => {
        playingAt(0, 0.5)
        play(cc(74, 30))
        playingAt(1, 0.25)
        play(cc(74, 90))

        expect(envelopes(0)[0].points).toEqual([{ time: 2, value: 30 }])
        expect(envelopes(1)[0].points).toEqual([{ time: 1, value: 90 }])
      })

      it("comes back to a step as a new pass, over what was just written", () => {
        playingAt(0, 0)
        play(cc(74, 30))
        playingAt(1, 0)
        play(cc(74, 60))
        // round the loop to step 0 again, half way through
        playingAt(0, 0.5)
        play(cc(74, 90))

        // stepped, 30 already holds up to the new pass
        expect(envelopes(0)[0].points).toEqual([
          { time: 0, value: 30 },
          { time: 2, value: 90 },
        ])
      })
    })

    it("says which envelope it is writing, once per envelope", () => {
      const lanes: unknown[] = []
      const previous = () => recorder.recordedLane
      expect(previous()).toBeNull()

      play(cc(74, 10))
      lanes.push(previous())
      play(cc(74, 20), cc(74, 30))
      // still the same envelope, so the same object: nothing to reopen
      expect(previous()).toBe(lanes[0])

      play(cc(7, 100))
      expect(previous()).not.toBe(lanes[0])
      expect(previous()).toMatchObject({ step: 0 })
      expect(previous()).not.toMatchObject({
        id: (lanes[0] as { id: number }).id,
      })
    })

    it("records a knob, not what a sequencer sends when it starts or stops", () => {
      // what a DAW sends on every channel at start and stop: All Sound Off,
      // Reset All Controllers, All Notes Off, and pitch-bend range by RPN
      for (let channel = 1; channel <= 16; channel++) {
        play(
          cc(120, 0, channel),
          cc(121, 0, channel),
          cc(123, 0, channel),
          cc(101, 0, channel),
          cc(100, 0, channel),
          cc(6, 12, channel),
          cc(38, 0, channel),
          cc(0, 0, channel),
          cc(32, 0, channel),
        )
      }
      expect(envelopes(0)).toEqual([])

      // among it, a knob turned is still heard
      play(cc(120, 0), cc(74, 30), cc(121, 0), cc(74, 60))
      expect(envelopes(0).map(({ cc }) => cc)).toEqual([74])
    })

    it("ignores controllers until recording is armed", () => {
      recorder.setRecording(false)
      play(cc(74, 90))
      expect(envelopes(0)).toEqual([])
    })

    it("records notes and controllers side by side", () => {
      play(noteOn(60), cc(74, 90), noteOn(64))
      expect(store.patch.steps[0].notes).toEqual([60, 64])
      expect(envelopes(0)[0].points).toEqual([{ time: 0, value: 90 }])
    })

    describe("through the input filter", () => {
      it("lets every controller on every channel through by default", () => {
        for (let channel = 1; channel <= 16; channel++) {
          play(cc(74, channel, channel))
        }
        expect(envelopes(0)).toHaveLength(16)
      })

      it("is never excluded or changed by the note range or transpose", () => {
        input.setFilter({
          ...createDefaultMIDIFilter(),
          // a range that no controller number here falls inside
          noteLow: 60,
          noteHigh: 61,
          transpose: 12,
        })
        play(cc(1, 64), cc(74, 100), cc(119, 0))

        // numbers and values exactly as they came in
        expect(
          envelopes(0).map(({ cc, points }) => [cc, points[0].value]),
        ).toEqual([
          [1, 64],
          [74, 100],
          [119, 0],
        ])
      })
    })
  })
})
