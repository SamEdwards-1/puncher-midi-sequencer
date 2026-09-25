import { describe, expect, it } from "vitest"
import { WHOLE_STEP } from "./envelopeGeometry"
import {
  bandBeats,
  moveRulerDrag,
  positionLabel,
  rulerMarks,
  startRulerDrag,
  zoomView,
} from "./rulerView"

describe("the envelope ruler", () => {
  it("counts positions in bars, beats and sixteenths from 1", () => {
    expect(positionLabel(0)).toBe("1")
    expect(positionLabel(1)).toBe("1.2")
    expect(positionLabel(4)).toBe("2")
    expect(positionLabel(5.75)).toBe("2.2.4")
  })

  it("labels as closely as there is room for", () => {
    // four beats across 480 pixels: a label every half beat
    const { every, marks } = rulerMarks(WHOLE_STEP, 4, 480)
    expect(every).toBe(0.5)
    expect(marks.map(({ label }) => label)).toEqual([
      "1",
      "1.1.3",
      "1.2",
      "1.2.3",
      "1.3",
      "1.3.3",
      "1.4",
      "1.4.3",
      "2",
    ])
    // sixteen bars across as much: every other bar
    expect(rulerMarks(WHOLE_STEP, 64, 480).every).toBe(8)
  })

  it("labels only what the view shows", () => {
    const { marks } = rulerMarks({ start: 0.5, end: 0.75 }, 4, 480)
    expect(marks[0].beat).toBe(2)
    expect(marks[marks.length - 1].beat).toBe(3)
  })

  it("shades the roll by the bar zoomed out and by the beat zoomed in", () => {
    // four bars across 1024 pixels: 64 a beat, too narrow to shade alone
    expect(bandBeats(WHOLE_STEP, 16, 1024)).toBe(4)
    // two bars: 128 a beat
    expect(bandBeats(WHOLE_STEP, 8, 1024)).toBe(1)
    // and closer in, by parts of a beat
    expect(bandBeats({ start: 0, end: 0.125 }, 4, 480)).toBe(0.25)
  })

  describe("zooming", () => {
    const drag = { anchor: 0.5, at: 0.5, dy: 0, stepBeats: 4 }

    it("zooms in going up and out going down, around the place pressed", () => {
      const inward = zoomView(WHOLE_STEP, { ...drag, dy: -60 })
      expect(inward.start).toBeCloseTo(0.25)
      expect(inward.end).toBeCloseTo(0.75)

      const back = zoomView(inward, { ...drag, dy: 60 })
      expect(back).toEqual(WHOLE_STEP)
    })

    it("scrolls with the mouse, sideways", () => {
      const half = { start: 0.25, end: 0.75 }
      // the time pressed follows the mouse a quarter of the way left
      const later = zoomView(half, { ...drag, at: 0.25 })
      expect(later.start).toBeCloseTo(0.375)
      expect(later.end).toBeCloseTo(0.875)
    })

    it("stays inside the step, and no further out than all of it", () => {
      expect(zoomView(WHOLE_STEP, { ...drag, dy: 500 })).toEqual(WHOLE_STEP)
      expect(zoomView(WHOLE_STEP, { ...drag, at: -3 })).toEqual(WHOLE_STEP)
      const edge = zoomView({ start: 0.5, end: 1 }, { ...drag, at: -1 })
      expect(edge).toEqual({ start: 0.5, end: 1 })
    })

    it("comes in no closer than an eighth of a beat", () => {
      const close = zoomView(WHOLE_STEP, { ...drag, dy: -5000 })
      expect(close.end - close.start).toBeCloseTo(1 / 32)
    })
  })

  describe("a drag", () => {
    // 400 pixels across a four-beat step
    const move = (
      drag: ReturnType<typeof startRulerDrag>,
      x: number,
      y: number,
    ) => moveRulerDrag(drag, { x, y }, 400, 4)

    it("zooms or scrolls, whichever way it sets off", () => {
      const up = move(startRulerDrag(WHOLE_STEP, 0.5), 5, -60)
      expect(up.axis).toBe("y")
      expect(up.view.start).toBeCloseTo(0.25)
      expect(up.view.end).toBeCloseTo(0.75)

      const half = { start: 0.25, end: 0.75 }
      const sideways = move(startRulerDrag(half, 0.5), -100, 5)
      expect(sideways.axis).toBe("x")
      expect(sideways.view.start).toBeCloseTo(0.375)
      expect(sideways.view.end).toBeCloseTo(0.875)
    })

    it("changes over when it clearly turns, not when it wobbles", () => {
      let drag = move(startRulerDrag(WHOLE_STEP, 0.5), 0, -60)
      // a wobble zooms by its up-and-down part only
      drag = move(drag, 3, 2)
      expect(drag.axis).toBe("y")
      const length = 0.5 * 2 ** (2 / 60)
      expect(drag.view.end - drag.view.start).toBeCloseTo(length)
      // a clear turn scrolls, and leaves the zoom alone
      drag = move(drag, -20, 0)
      expect(drag.axis).toBe("x")
      expect(drag.view.end - drag.view.start).toBeCloseTo(length)
    })

    it("keeps the time pressed on under the rule, at the step's edge too", () => {
      let drag = move(startRulerDrag(WHOLE_STEP, 0.5), 0, -60)
      // scrolled hard right runs into the step's start
      drag = move(drag, 1000, 0)
      expect(drag.view.start).toBe(0)
      expect(drag.at).toBeCloseTo(1)
      // and heads back straight away
      drag = move(drag, -40, 0)
      expect(drag.view.start).toBeGreaterThan(0)
    })
  })
})
