import {
  addEnvelope,
  createDefaultPatch,
  EnvelopePointJSON,
  PatchJSON,
  setStepNotes,
} from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch
const envelopes = () => patch().steps[0].envelopes
const points = () => envelopes()[0].points
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

// jsdom has no layout, so the graph is its fallback 480 by 160, inset by 6
const X = (time: number) => 6 + time * 468
const Y = (value: number) => 6 + (1 - value / 127) * 148

const frame = () => screen.getByRole("application", { name: "Envelope" })
const svg = () => frame().querySelector("svg") as SVGSVGElement
const press = (x: number, y: number, init: MouseEventInit = {}) =>
  fireEvent.mouseDown(svg(), {
    clientX: x,
    clientY: y,
    button: 0,
    detail: 1,
    ...init,
  })
const moveTo = (x: number, y: number, init: MouseEventInit = {}) =>
  fireEvent.mouseMove(document, { clientX: x, clientY: y, ...init })
const release = (x: number, y: number) =>
  fireEvent.mouseUp(document, { clientX: x, clientY: y })
const clickAt = (x: number, y: number, init: MouseEventInit = {}) => {
  press(x, y, init)
  release(x, y)
}
const dragFrom = (
  from: [number, number],
  path: [number, number][],
  init: MouseEventInit = {},
) => {
  press(...from, init)
  for (const [x, y] of path) {
    moveTo(x, y, init)
  }
  const [x, y] = path[path.length - 1]
  release(x, y)
}

const ramp: EnvelopePointJSON[] = [
  { time: 0.25, value: 32 },
  { time: 0.75, value: 96 },
]

/**
 * A quarter-note sequencer, so step 1 is one beat; with the default 1/16
 * grid its lines fall at quarters of the step.
 */
const setup = (
  shape: EnvelopePointJSON[] | null = ramp,
  change: (patch: PatchJSON) => PatchJSON = (patch) => patch,
) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
  })
  let start: PatchJSON = { ...createDefaultPatch(), pace: "4th" }
  if (shape !== null) {
    start = addEnvelope(start, 0, { cc: 74, channel: 1, points: shape })
  }
  rootStore.sequencerStore.patch = change(start)
  render(<App rootStore={rootStore} />)
  fireEvent.click(screen.getByRole("button", { name: "Step 1" }))
  // the tool is view state and lives on past a render
  click("Edit")
}

describe("the envelope editor", () => {
  describe("CCs", () => {
    it("adds a CC as a tab holding a flat line, and opens it", () => {
      setup(null)
      expect(screen.getByText(/No CCs on this step/)).toBeInTheDocument()

      click("Add CC")
      expect(envelopes()).toMatchObject([
        { cc: 74, channel: 1, points: [{ time: 0, value: 64 }] },
      ])
      expect(screen.getByRole("tab", { name: "CC 74" })).toHaveAttribute(
        "aria-selected",
        "true",
      )

      // the next takes the next number free, and opens in its place
      click("Add CC")
      expect(envelopes().map(({ cc }) => cc)).toEqual([74, 75])
      expect(screen.getByRole("tab", { name: "CC 75" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      expect(screen.getByRole("tab", { name: "CC 74" })).toHaveAttribute(
        "aria-selected",
        "false",
      )
    })

    it("switches between a step's CCs, each drawn on its own", () => {
      setup(ramp, (start) =>
        addEnvelope(start, 0, {
          cc: 10,
          channel: 1,
          points: [{ time: 0, value: 0 }],
        }),
      )
      fireEvent.click(screen.getByRole("tab", { name: "CC 10" }))
      expect(svg().querySelectorAll("[data-point]")).toHaveLength(1)

      fireEvent.click(screen.getByRole("tab", { name: "CC 74" }))
      expect(svg().querySelectorAll("[data-point]")).toHaveLength(2)
    })

    it("edits the open CC's number and channel, and names it", () => {
      setup()
      expect(screen.getByText("Brightness")).toBeInTheDocument()

      click("CC number up")
      expect(envelopes()[0].cc).toBe(75)
      expect(screen.getByRole("tab", { name: "CC 75" })).toBeInTheDocument()

      const typed = screen.getByLabelText("CC channel")
      fireEvent.focus(typed)
      fireEvent.change(typed, { target: { value: "12" } })
      fireEvent.keyDown(typed, { key: "Enter" })
      expect(envelopes()[0].channel).toBe(12)
    })

    it("removes the open CC", () => {
      setup()
      click("Remove CC")
      expect(envelopes()).toEqual([])
      expect(screen.queryByRole("tab")).toBeNull()
    })
  })

  describe("editing", () => {
    it("adds a point on the line where it is clicked, keeping the shape", () => {
      setup()
      clickAt(X(0.5), Y(64))
      expect(points()).toEqual([
        { time: 0.25, value: 32 },
        { time: 0.5, value: 64 },
        { time: 0.75, value: 96 },
      ])
    })

    it("places a point on a double-click, on the grid", () => {
      setup()
      // a hair off the 1/16 line and well off the line
      clickAt(X(0.9), Y(10), { detail: 2 })
      expect(points()).toContainEqual({ time: 1, value: 10 })
    })

    it("does nothing on a single click away from the line", () => {
      setup()
      const before = patch()
      clickAt(X(0.9), Y(10))
      expect(patch()).toBe(before)
    })

    it("drags a point, snapping its time to the grid", () => {
      setup()
      dragFrom([X(0.25), Y(32)], [[X(0.45), Y(64)]])
      expect(points()[0]).toEqual({ time: 0.5, value: 64 })
    })

    it("drags freely with Alt held", () => {
      setup()
      dragFrom([X(0.25), Y(32)], [[X(0.45), Y(64)]], { altKey: true })
      expect(points()[0].time).toBeCloseTo(0.45)
    })

    it("leaves a point's time alone on a drag straight up or down", () => {
      setup([
        { time: 0.3, value: 32 },
        { time: 0.75, value: 96 },
      ])
      dragFrom([X(0.3), Y(32)], [[X(0.3) + 1, Y(80)]])
      expect(points()[0]).toEqual({ time: 0.3, value: 80 })
    })

    it("never drags a point past its neighbours", () => {
      setup()
      dragFrom([X(0.25), Y(32)], [[X(1), Y(32)]])
      expect(points()[0].time).toBe(0.75)
    })

    it("raises the line between two points by dragging it", () => {
      setup()
      dragFrom([X(0.5), Y(64)], [[X(0.5), Y(84)]])
      expect(points().map(({ value }) => value)).toEqual([52, 116])
      // their times don't move
      expect(points().map(({ time }) => time)).toEqual([0.25, 0.75])
    })

    it("deletes a point that is clicked", () => {
      setup()
      clickAt(X(0.75), Y(96))
      expect(points()).toEqual([{ time: 0.25, value: 32 }])
    })

    it("keeps a point double-clicked on the line rather than deleting it", () => {
      setup()
      clickAt(X(0.5), Y(64))
      clickAt(X(0.5), Y(64), { detail: 2 })
      expect(points()).toHaveLength(3)
    })

    it("makes a whole drag one undo entry", () => {
      setup()
      const before = patch()
      dragFrom(
        [X(0.25), Y(32)],
        [
          [X(0.3), Y(40)],
          [X(0.4), Y(60)],
          [X(0.5), Y(70)],
        ],
      )
      expect(points()[0]).toEqual({ time: 0.5, value: 70 })

      click("Undo")
      expect(patch()).toBe(before)
    })
  })

  describe("drawing", () => {
    const useDraw = () => click("Draw")

    it("paints each grid cell the mouse crosses as a flat step", () => {
      setup([
        { time: 0, value: 0 },
        { time: 1, value: 0 },
      ])
      useDraw()
      dragFrom(
        [X(0.3), Y(100)],
        [
          [X(0.55), Y(100)],
          [X(0.6), Y(50)],
        ],
      )
      // the cells from 1/4 to 3/4, the second repainted on the way
      expect(points()).toEqual([
        { time: 0, value: 0 },
        { time: 0.25, value: 0 },
        { time: 0.25, value: 100 },
        { time: 0.5, value: 100 },
        { time: 0.5, value: 50 },
        { time: 0.75, value: 50 },
        { time: 0.75, value: 0 },
        { time: 1, value: 0 },
      ])
    })

    it("fills in the cells a quick stroke skips", () => {
      setup([{ time: 0, value: 0 }])
      useDraw()
      dragFrom([X(0.1), Y(0)], [[X(0.9), Y(120)]])
      // four cells from 0 to 120, each on its own step
      expect(points().map(({ value }) => value)).toEqual([
        0, 0, 40, 40, 80, 80, 120, 120,
      ])
    })

    it("paints freely with Alt held", () => {
      setup([])
      useDraw()
      dragFrom(
        [X(0.1), Y(10)],
        [
          [X(0.2), Y(20)],
          [X(0.3), Y(30)],
        ],
        { altKey: true },
      )
      expect(points().map(({ time }) => time)).toEqual([
        expect.closeTo(0.1),
        expect.closeTo(0.2),
        expect.closeTo(0.3),
      ])
    })

    it("switches tools with B while the graph has focus, leaving Bump alone", () => {
      setup()
      const draw = screen.getByRole("button", { name: "Draw" })
      frame().focus()

      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(draw).toHaveAttribute("aria-pressed", "true")
      expect(rootStore.player.actions.bump).toBe(false)
      fireEvent.keyUp(frame(), { code: "KeyB" })

      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(draw).toHaveAttribute("aria-pressed", "false")

      // anywhere else, B is still Bump
      fireEvent.keyDown(document.body, { code: "KeyB" })
      expect(rootStore.player.actions.bump).toBe(true)
      fireEvent.keyUp(document.body, { code: "KeyB" })
    })
  })

  describe("the notes underneath", () => {
    const notes = () => [...svg().querySelectorAll("[data-note]")]

    it("shows the notes the step plays, in each voice's colour", () => {
      // voice 1 plays 8ths across the quarter-note step
      setup(ramp, (start) => setStepNotes(start, 0, [60, 64]))
      expect(notes()).toHaveLength(2)
      expect(notes()[0]).toHaveAttribute("data-voice", "0")
      expect(notes()[0]).toHaveAttribute("fill", "var(--midiseq-voice-0)")
    })

    it("follows the voices as they change", () => {
      setup(ramp, (start) => setStepNotes(start, 0, [60, 64]))
      const voices = within(screen.getByRole("region", { name: "Voices" }))
      fireEvent.change(voices.getByLabelText("Pace"), {
        target: { value: "16th" },
      })
      expect(notes()).toHaveLength(4)

      fireEvent.click(screen.getByRole("button", { name: "Voice 1 Dot 1" }))
      expect(notes()).toHaveLength(3)
    })

    it("can't be dragged or clicked", () => {
      setup([], (start) => setStepNotes(start, 0, [60]))
      const before = patch()
      const note = notes()[0]
      fireEvent.mouseDown(note, { clientX: X(0.1), clientY: Y(64) })
      fireEvent.mouseUp(document)
      expect(patch()).toBe(before)
    })
  })
})
