import {
  addEnvelope,
  EnvelopePointJSON,
  PatchJSON,
  setStepNotes,
} from "@midiseq/core"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  centreX,
  click,
  dragFrom,
  envelopes,
  openEditor,
  patch,
  points,
  press,
  ramp,
  release,
  rootStore,
  startStore,
  svg,
  X,
  Y,
} from "../../test/envelopeEditor"
import { makeScale } from "../../theory/scales"
import { App } from "../App/App"

const setup = (
  shape: EnvelopePointJSON[] | null = ramp,
  change: (patch: PatchJSON) => PatchJSON = (patch) => patch,
) => {
  render(<App rootStore={startStore(shape, change)} />)
  openEditor(shape)
}

describe("recording into the editor", () => {
  afterEach(() => vi.useRealTimers())
  const openTab = () =>
    screen
      .getAllByRole("tab")
      .find((tab) => tab.getAttribute("aria-selected") === "true")
      ?.textContent?.trim()
  const handles = () => svg().querySelectorAll("[data-point]").length

  it("opens a knob's tab and shows its values as they arrive", () => {
    setup(null)
    vi.useFakeTimers()
    // the voice's velocity is what is on show to begin with
    expect(openTab()).toBe("Velocity 1")

    click("Record")
    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 30, 10])
    })
    expect(openTab()).toBe("CC 30")

    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 30, 90])
      rootStore.midiInput.handleMessage([0xb0, 30, 40])
      vi.advanceTimersByTime(33)
    })
    // the three values it was turned to, each holding a third of the step
    expect(points().map(({ value }) => value)).toEqual([10, 90, 40])
    const times = points().map(({ time }) => time)
    for (const [index, time] of [0, 1 / 3, 2 / 3].entries()) {
      expect(times[index]).toBeCloseTo(time)
    }
    expect(handles()).toBe(3)
    // and both ends of each jump are drawn, as in Live
    expect(svg().querySelectorAll("[data-corner]")).toHaveLength(2)
  })

  it("leaves a tab clicked away from while the knob still turns", () => {
    setup(null)
    click("Record")
    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 30, 10])
    })
    fireEvent.click(screen.getByRole("tab", { name: "Velocity 2" }))

    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 30, 90])
    })
    expect(openTab()).toBe("Velocity 2")

    // until a different knob moves
    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 31, 50])
    })
    expect(openTab()).toBe("CC 31")
  })

  it("names the channel where the same CC is on several", () => {
    setup(null)
    click("Record")
    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 74, 10])
      rootStore.midiInput.handleMessage([0xb1, 74, 20])
      rootStore.midiInput.handleMessage([0xb0, 7, 90])
    })
    const labels = screen
      .getAllByRole("tab")
      .map((tab) => tab.textContent?.trim())
      .filter((label) => label?.startsWith("CC"))
    // a number on its own when it is the only one
    expect(labels).toEqual(["CC 74 · ch 1", "CC 74 · ch 2", "CC 7"])
  })

  it("stays put for a knob recorded onto a step not on show", () => {
    setup(null)
    click("Record")
    rootStore.recorder.setTarget(5)
    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 30, 10])
    })
    expect(openTab()).toBe("Velocity 1")
  })
})

describe("changing the pace under an envelope", () => {
  // the ramp is drawn on a one-beat step: 32 at a quarter beat, 96 at three
  const setPace = (pace: PatchJSON["pace"]) =>
    act(() => {
      rootStore.sequencerStore.patch = { ...patch(), pace }
    })
  const drawnAt = () => [...svg().querySelectorAll("[data-point]")].map(centreX)

  it("keeps each point at its beat on a longer step", () => {
    setup()
    setPace("2nd")

    expect(points()).toEqual(ramp)
    // two beats across the graph now, so both sit in its first half
    expect(drawnAt()).toEqual([X(0.25 / 2), X(0.75 / 2)])
  })

  it("keeps what falls past a shorter step, and plays it when it grows", () => {
    setup()
    setPace("8th")
    // half a beat across the graph: the second point lies past its end
    expect(drawnAt()[1]).toBeGreaterThan(X(1))

    // editing what is on show leaves it be
    dragFrom([X(0.5), Y(32)], [[X(0.5), Y(64)]])
    expect(points()[0].value).toBeGreaterThan(32)
    expect(points().at(-1)).toEqual({ time: 0.75, value: 96 })

    setPace("4th")
    expect(points().at(-1)).toEqual({ time: 0.75, value: 96 })
  })
})

describe("clicking between steps", () => {
  const openTab = () =>
    screen
      .getAllByRole("tab")
      .find((tab) => tab.getAttribute("aria-selected") === "true")
      ?.textContent?.trim()
  const step = (n: number) => click(`Step ${n}`)
  const on = (index: number) => patch().steps[index].envelopes

  it("keeps a CC tab open, showing each step's own envelope", () => {
    setup(ramp, (start) =>
      addEnvelope(start, 1, {
        cc: 74,
        channel: 1,
        points: [{ time: 0, value: 5 }],
      }),
    )
    fireEvent.click(screen.getByRole("tab", { name: "CC 74" }))

    step(2)
    expect(openTab()).toBe("CC 74")
    expect(svg().querySelectorAll("[data-point]")).toHaveLength(1)
  })

  it("keeps it open on a step without that CC, ready to draw into", () => {
    setup()
    fireEvent.click(screen.getByRole("tab", { name: "CC 74" }))

    step(3)
    expect(openTab()).toBe("CC 74")
    expect(on(2)).toEqual([])

    // a double-click places the first point, and makes the envelope
    press(X(0.5), Y(64), { detail: 2 })
    release(X(0.5), Y(64))
    expect(on(2)).toMatchObject([{ cc: 74, channel: 1 }])
    expect(on(2)[0].points).toHaveLength(1)
  })

  it("keeps a Velocity tab open", () => {
    setup()
    fireEvent.click(screen.getByRole("tab", { name: "Velocity 2" }))
    step(3)
    step(1)
    expect(openTab()).toBe("Velocity 2")
  })

  it("doesn't open a knob's tab by landing on the step it was recorded on", () => {
    setup(null)
    click("Record")
    act(() => {
      rootStore.midiInput.handleMessage([0xb0, 30, 10])
    })
    expect(openTab()).toBe("CC 30")
    fireEvent.click(screen.getByRole("tab", { name: "Velocity 1" }))

    step(2)
    step(1)
    expect(openTab()).toBe("Velocity 1")
  })

  describe("steps and ramps", () => {
    it("switches a CC between stepping and ramping", () => {
      setup()
      const line = () =>
        svg().querySelector("[data-envelope-line]")?.getAttribute("d")
      const ramped = line()
      expect(screen.getByRole("button", { name: "Ramps" })).toHaveAttribute(
        "aria-pressed",
        "true",
      )
      expect(svg().querySelectorAll("[data-corner]")).toHaveLength(0)

      click("Steps")
      expect(envelopes()[0].shape).toBe("steps")
      expect(line()).not.toBe(ramped)
      // both ends of the one jump
      expect(svg().querySelectorAll("[data-corner]")).toHaveLength(1)

      click("Ramps")
      expect(envelopes()[0].shape).toBe("ramps")
      expect(line()).toBe(ramped)
    })

    it("steps a CC drawn onto a step that had none", () => {
      setup(null)
      click("Add CC")
      expect(envelopes()[0].shape).toBe("steps")
      expect(screen.getByRole("button", { name: "Steps" })).toHaveAttribute(
        "aria-pressed",
        "true",
      )
    })
  })

  describe("the piano keys", () => {
    const piano = () => document.querySelector("[data-piano]") as SVGSVGElement
    const keyAt = (note: number) =>
      piano().querySelector(`[data-key="${note}"]`) as SVGRectElement

    it("has a key for each row of the roll, naming each C", () => {
      setup(ramp, (patch) => setStepNotes(patch, 0, [55, 72]))
      const rows = svg().getAttribute("data-keys")?.split("-").map(Number)
      const [low, high] = rows ?? []
      expect(piano().querySelectorAll("[data-key]")).toHaveLength(
        high - low + 1,
      )
      expect(
        [...piano().querySelectorAll("text")].map((text) => text.textContent),
      ).toContain("C4")
    })

    it("tints the keys in the patch's scale", () => {
      setup(ramp, (patch) => ({
        ...setStepNotes(patch, 0, [60, 72]),
        scale: makeScale(0, "major"),
      }))
      expect(keyAt(60)).toHaveAttribute("data-in-scale", "true")
      expect(keyAt(61)).toHaveAttribute("data-in-scale", "false")
      expect(keyAt(71)).toHaveAttribute("data-in-scale", "true")
    })

    it("collapses the scale to the keys the sequence plays, and back", () => {
      setup(ramp, (patch) =>
        setStepNotes(setStepNotes(patch, 0, [55, 72]), 3, [60]),
      )
      const keys = () =>
        [...piano().querySelectorAll("[data-key]")].map((key) =>
          Number(key.getAttribute("data-key")),
        )
      expect(keys()).toHaveLength(72 - 55 + 1)

      click("Collapse scale — show only the keys the sequence plays")
      expect(keys()).toEqual([72, 60, 55])
      // the roll's rows follow, and its notes keep to them
      expect(
        [...svg().querySelectorAll("[data-row]")].map((row) =>
          Number(row.getAttribute("data-row")),
        ),
      ).toEqual([72, 60, 55])
      // with room, every key is named
      expect(
        [...piano().querySelectorAll("text")].map((text) => text.textContent),
      ).toEqual(["C5", "C4", "G3"])

      click("Collapse scale — show only the keys the sequence plays")
      expect(keys()).toHaveLength(72 - 55 + 1)
    })

    it("shades the roll's columns in turn", () => {
      setup()
      // a one-beat step 468 pixels across: a band to each sixteenth, every
      // other one shaded
      const bands = [...svg().querySelectorAll("[data-band]")].map((band) =>
        Number(band.getAttribute("data-band")),
      )
      expect(bands).toEqual([0.25, 0.75])
    })

    it("rules off each octave under its C, in a column of its own", () => {
      setup(ramp, (patch) => setStepNotes(patch, 0, [55, 72]))
      const c4 = keyAt(60)
      // the keys sit right of the octaves' column
      expect(Number(c4.getAttribute("x"))).toBeGreaterThan(0)
      const bottom =
        Number(c4.getAttribute("y")) + Number(c4.getAttribute("height"))
      const rules = [...piano().querySelectorAll("line")].filter(
        (line) =>
          line.getAttribute("x1") === "0" &&
          Math.abs(Number(line.getAttribute("y1")) - bottom) < 0.01,
      )
      expect(rules).toHaveLength(1)
    })

    it("names the key under the mouse", () => {
      setup(ramp, (patch) => setStepNotes(patch, 0, [55, 72]))
      const key = keyAt(61)
      fireEvent.mouseMove(piano(), {
        clientY: Number(key.getAttribute("y")) + 1,
      })
      expect(piano().querySelector("[data-hover-note]")).toHaveAttribute(
        "data-hover-note",
        "C#4",
      )
      fireEvent.mouseLeave(piano())
      expect(piano().querySelector("[data-hover-note]")).toBeNull()
    })
  })

  describe("the ruler", () => {
    const ruler = () =>
      screen.getByTitle(/^Ruler/).closest("svg") as SVGSVGElement
    const marks = () =>
      [...ruler().querySelectorAll("[data-mark]")].map((mark) =>
        mark.getAttribute("data-mark"),
      )
    const dragRuler = (x: number, dx: number, dy: number) => {
      fireEvent.mouseDown(ruler(), { clientX: x, clientY: 10, button: 0 })
      fireEvent.mouseMove(document, { clientX: x + dx, clientY: 10 + dy })
      fireEvent.mouseUp(document, { clientX: x + dx, clientY: 10 + dy })
    }
    const pointX = (index: number) =>
      centreX(svg().querySelector(`[data-point="${index}"]`) as Element)

    it("shows where on the step the graph is", () => {
      setup()
      // a one-beat step: its sixteenths
      expect(marks()).toEqual(["1", "1.1.2", "1.1.3", "1.1.4", "1.2"])
    })

    it("zooms in dragging up, around the place pressed, and back out dragging down", () => {
      setup()
      expect(pointX(0)).toBeCloseTo(X(0.25))

      // up a doubling, pressed halfway across: the middle half fills the graph
      dragRuler(X(0.5), 0, -60)
      expect(pointX(0)).toBeCloseTo(X(0))
      expect(pointX(1)).toBeCloseTo(X(1))
      expect(marks()).toEqual(["1.1.2", "1.1.3", "1.1.4"])

      // and the pointer is hidden only while dragging
      expect(document.querySelector(".cursor-none")).toBeNull()

      dragRuler(X(0.5), 0, 200)
      expect(pointX(0)).toBeCloseTo(X(0.25))
    })

    it("zooms or scrolls, one at a time, changing over mid-drag", () => {
      setup()
      const width = () => pointX(1) - pointX(0)
      // mostly up, drifting right: only a zoom
      dragRuler(X(0.5), 30, -60)
      expect(pointX(0)).toBeCloseTo(X(0))
      expect(pointX(1)).toBeCloseTo(X(1))

      fireEvent.mouseDown(ruler(), { clientX: X(0.5), clientY: 10, button: 0 })
      // up again, zooming in further
      fireEvent.mouseMove(document, { clientX: X(0.5), clientY: -50 })
      const zoomed = width()
      expect(zoomed).toBeCloseTo(2 * (X(1) - X(0)))
      // then, without letting go, left: a scroll, at the same zoom
      fireEvent.mouseMove(document, { clientX: X(0.5) - 60, clientY: -50 })
      expect(width()).toBeCloseTo(zoomed)
      const scrolled = pointX(1)
      // a wobble on the way isn't a zoom
      fireEvent.mouseMove(document, { clientX: X(0.5) - 62, clientY: -47 })
      expect(width()).toBeCloseTo(zoomed)
      expect(pointX(1)).toBeCloseTo(scrolled - 2)
      // and down, clearly, zooms back out
      fireEvent.mouseMove(document, { clientX: X(0.5) - 62, clientY: 200 })
      fireEvent.mouseUp(document, { clientX: X(0.5) - 62, clientY: 200 })
      expect(width()).toBeCloseTo(X(1) - X(0.5))
      expect(pointX(0)).toBeCloseTo(X(0.25))
    })

    it("rules the time pressed on through the roll while dragging", () => {
      setup()
      const rule = () => svg().querySelector("[data-zoom-mark]")
      expect(rule()).toBeNull()

      fireEvent.mouseDown(ruler(), { clientX: X(0.25), clientY: 10, button: 0 })
      expect(rule()).toHaveAttribute("x1", String(X(0.25)))
      // zooming holds it where it was pressed
      fireEvent.mouseMove(document, { clientX: X(0.25), clientY: -50 })
      expect(Number(rule()?.getAttribute("x1"))).toBeCloseTo(X(0.25))
      // and the pointer is hidden meanwhile
      expect(document.querySelector(".cursor-none")).not.toBeNull()

      fireEvent.mouseUp(document, { clientX: X(0.25), clientY: -50 })
      expect(rule()).toBeNull()
      expect(document.querySelector(".cursor-none")).toBeNull()
    })

    it("scrolls dragging sideways, and edits where the zoomed graph shows", () => {
      setup()
      dragRuler(X(0.5), 0, -60)
      // the roll follows the mouse left a quarter of the graph
      dragRuler(X(0.5), -117, 0)
      expect(pointX(1)).toBeCloseTo(X(0.75))

      // a point dragged a quarter of the graph moves an eighth of the step
      dragFrom([X(0.75), Y(96)], [[X(0.5), Y(96)]], { altKey: true })
      expect(points()[1].time).toBeCloseTo(0.625)
    })
  })
})
