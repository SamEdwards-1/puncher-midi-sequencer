import {
  addEnvelope,
  createDefaultPatch,
  EnvelopePointJSON,
  PatchJSON,
  setStepNotes,
} from "@midiseq/core"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch
const envelopes = () => patch().steps[0].envelopes
const points = () => envelopes()[0].points
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

// jsdom has no layout, so the graph is its fallback 480 by 240, inset by 6
const X = (time: number) => 6 + time * 468
const Y = (value: number) => 6 + (1 - value / 127) * 228

// the middle of a point's square handle
const centreX = (handle: Element) =>
  Number(handle.getAttribute("x")) + Number(handle.getAttribute("width")) / 2

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
    // settings such as the accent amount start fresh for every test
    storage: null,
  })
  let start: PatchJSON = { ...createDefaultPatch(), pace: "4th" }
  if (shape !== null) {
    // these tests were written for ramps; steps have their own below
    start = addEnvelope(start, 0, {
      cc: 74,
      channel: 1,
      shape: "ramps",
      points: shape,
    })
  }
  rootStore.sequencerStore.patch = change(start)
  render(<App rootStore={rootStore} />)
  fireEvent.click(screen.getByRole("button", { name: "Step 1" }))
  // the voice, lane and tool are view state and live on past a render
  fireEvent.click(screen.getByRole("button", { name: "Voice 1" }))
  fireEvent.click(
    screen.getByRole("tab", { name: shape !== null ? "CC 74" : "Velocity 1" }),
  )
  // both kinds of lane have the tools
  click("Edit points")
}

const tab = (name: string) => screen.queryByRole("tab", { name })
const type = (label: string, text: string) => {
  const field = screen.getByLabelText(label)
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: "Enter" })
}

describe("the envelope editor", () => {
  describe("CCs", () => {
    it("adds a CC as a tab holding a flat line, and opens it", () => {
      setup(null)
      expect(tab("CC 74")).toBeNull()

      click("Add CC")
      expect(envelopes()).toMatchObject([
        { cc: 74, channel: 1, points: [{ time: 0, value: 64 }] },
      ])
      expect(tab("CC 74")).toHaveAttribute("aria-selected", "true")

      // the next takes the next number free, and opens in its place
      click("Add CC")
      expect(envelopes().map(({ cc }) => cc)).toEqual([74, 75])
      expect(tab("CC 75")).toHaveAttribute("aria-selected", "true")
      expect(tab("CC 74")).toHaveAttribute("aria-selected", "false")
    })

    it("switches between a channel's CCs, each drawn on its own", () => {
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

    it("edits the open CC's number, and names it", () => {
      setup()
      expect(screen.getByText("Brightness")).toBeInTheDocument()

      click("CC number up")
      expect(envelopes()[0].cc).toBe(75)
      expect(tab("CC 75")).toBeInTheDocument()

      const typed = screen.getByLabelText("CC number")
      fireEvent.focus(typed)
      fireEvent.change(typed, { target: { value: "11" } })
      fireEvent.keyDown(typed, { key: "Enter" })
      expect(envelopes()[0].cc).toBe(11)
      expect(screen.getByText("Expression (MSB)")).toBeInTheDocument()
    })

    it("removes the open CC", () => {
      setup()
      click("Remove CC")
      expect(envelopes()).toEqual([])
      expect(tab("CC 74")).toBeNull()
    })
  })

  describe("channels", () => {
    it("gives every voice a Velocity tab, on or off", () => {
      setup(null)
      for (const number of [1, 2, 3, 4]) {
        expect(tab(`Velocity ${number}`)).toBeInTheDocument()
      }
      expect(tab("Velocity 1")).toHaveAttribute("aria-selected", "true")
    })

    it("sets a voice's velocity from its Velocity tab, and no channel", () => {
      setup(null)
      fireEvent.click(screen.getByRole("tab", { name: "Velocity 2" }))
      // a note's velocity goes with the note, on its voice's channel
      expect(screen.queryByLabelText("Voice 2 channel")).toBeNull()

      type("Voice 2 velocity", "90")
      expect(patch().voices[1].velocity).toBe(90)
      // the line moves with it
      click("Voice 2 velocity down")
      expect(patch().voices[1].velocity).toBe(89)

      fireEvent.click(screen.getByRole("button", { name: "Voice 2" }))
      const voices = within(screen.getByRole("region", { name: "Voices" }))
      // the panel's Velocity shows the same number
      expect(voices.getByText("89")).toBeInTheDocument()
    })

    it("never lets two voices share a channel", () => {
      setup(null)
      const voices = within(screen.getByRole("region", { name: "Voices" }))
      // voices on 1 to 4: stepping voice 1 up passes over 2, 3 and 4
      fireEvent.click(voices.getByRole("button", { name: "Channel up" }))
      expect(patch().voices[0].channel).toBe(5)
      const channels = patch().voices.map(({ channel }) => channel)
      expect(new Set(channels).size).toBe(4)
    })

    it("sets a CC's channel in its row", () => {
      setup()
      click("CC channel up")
      expect(envelopes()[0].channel).toBe(2)

      type("CC channel", "16")
      expect(envelopes()[0].channel).toBe(16)
      // whatever is typed lands inside MIDI's channels
      type("CC channel", "40")
      expect(envelopes()[0].channel).toBe(16)
    })

    it("adds a CC on the channel of the lane it is added from", () => {
      setup(null, (start) => ({
        ...start,
        voices: start.voices.map((voice, index) =>
          index === 2 ? { ...voice, channel: 7 } : voice,
        ),
      }))
      fireEvent.click(screen.getByRole("tab", { name: "Velocity 3" }))
      click("Add CC")
      // and from that CC, another on its channel, the next number free there
      click("Add CC")
      fireEvent.click(screen.getByRole("tab", { name: "Velocity 1" }))
      click("Add CC")

      expect(envelopes().map(({ cc, channel }) => [cc, channel])).toEqual([
        [74, 7],
        [75, 7],
        [74, 1],
      ])
    })

    it("opens the working voice's velocity when a CC tab goes", () => {
      setup()
      fireEvent.click(screen.getByRole("button", { name: "Voice 3" }))
      click("Remove CC")
      expect(tab("Velocity 3")).toHaveAttribute("aria-selected", "true")
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

    it("shows the envelope's value while the mouse is over the line", () => {
      setup()
      const readout = () => svg().querySelector("[data-envelope-value]")
      fireEvent.mouseMove(svg(), { clientX: X(0.5), clientY: Y(64) })
      expect(readout()).toHaveAttribute("data-envelope-value", "64")
      expect(readout()?.textContent).toBe("64")

      // over a point, the point's value
      fireEvent.mouseMove(svg(), { clientX: X(0.75), clientY: Y(96) })
      expect(readout()).toHaveAttribute("data-envelope-value", "96")

      // and nothing away from the line
      fireEvent.mouseMove(svg(), { clientX: X(0.5), clientY: Y(10) })
      expect(readout()).toBeNull()
    })

    it("shows the value under the mouse as a point is dragged", () => {
      setup()
      press(X(0.25), Y(32))
      moveTo(X(0.25), Y(50))
      fireEvent.mouseMove(svg(), {
        clientX: X(0.25),
        clientY: Y(50),
        buttons: 1,
      })
      expect(svg().querySelector("[data-envelope-value]")).toHaveAttribute(
        "data-envelope-value",
        "50",
      )
      release(X(0.25), Y(50))
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

      fireEvent.click(editItem("Undo"))
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

    it("keep their voice's own colour under an envelope", () => {
      setup(ramp, (start) => setStepNotes(start, 0, [60]))
      expect(notes()[0]).not.toHaveAttribute("fill-opacity")
    })

    it("keep the same keys from step to step", () => {
      setup([], (start) =>
        setStepNotes(setStepNotes(start, 0, [60]), 5, [72, 76]),
      )
      const keys = () => svg().getAttribute("data-keys")
      // the grid's lowest key at the bottom, its highest at the top
      expect(keys()).toBe("60-76")

      fireEvent.click(screen.getByRole("button", { name: "Step 6" }))
      expect(keys()).toBe("60-76")
      // and a step with nothing on it doesn't close them up either
      fireEvent.click(screen.getByRole("button", { name: "Step 9" }))
      expect(keys()).toBe("60-76")
    })

    it("moves when a key is set beyond them", () => {
      setup([], (start) =>
        setStepNotes(setStepNotes(start, 0, [67]), 5, [72, 76]),
      )
      const keys = () => svg().getAttribute("data-keys")
      expect(keys()).toBe("67-76")

      // step 1's G4 down a semitone: the bottom row follows it
      click("Note 1 down")
      expect(keys()).toBe("66-76")
    })

    it("reach every note a voice's offset takes past the grid's keys", () => {
      setup([], (start) => {
        const next = setStepNotes(start, 0, [60, 64])
        next.voices[1] = { ...next.voices[1], enabled: true, offset: 24 }
        return next
      })
      expect(svg().getAttribute("data-keys")).toBe("60-88")
      const shown = notes().map((note) => note.getAttribute("data-voice"))
      expect(shown).toContain("1")
      expect(shown).toContain("0")
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

  describe("velocity", () => {
    // voice 1 plays 8ths across the quarter-note step: points at 0 and a half
    const withNotes = (start: PatchJSON) => setStepNotes(start, 0, [60, 64])
    const velocityPoints = () => [...svg().querySelectorAll("[data-point]")]
    const velocities = () =>
      velocityPoints().map((point) =>
        Number(point.getAttribute("data-velocity")),
      )
    const dot = (number: number) =>
      screen.getByRole("button", { name: `Voice 1 Dot ${number}` })
    const firstBar = X(0)
    const secondBar = X(0.5)

    it("draws a line with a point at each of the voice's notes", () => {
      setup(null, withNotes)
      expect(tab("Velocity 1")).toHaveAttribute("aria-selected", "true")
      expect(velocities()).toEqual([64, 64])
      expect(centreX(velocityPoints()[1])).toBeCloseTo(X(0.5))
      expect(svg().querySelector("[data-envelope-line]")).not.toBeNull()
      // as for a CC, and no bars
      expect(svg().querySelector("[data-bar]")).toBeNull()
      expect(screen.getByRole("button", { name: "Draw" })).toBeInTheDocument()
    })

    it("marks where a note is plain and where it is either accent", () => {
      setup(null, withNotes)
      const levels = [...svg().querySelectorAll("[data-level]")].map((line) =>
        Number(line.getAttribute("data-level")),
      )
      expect(levels).toEqual([44, 64, 84])
    })

    it("makes a point dragged onto an accent's velocity that accent", () => {
      setup(null, withNotes)
      dragFrom([firstBar, Y(64)], [[firstBar, Y(84)]])

      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "+",
        velocityOffset: 0,
      })
      expect(velocities()).toEqual([84, 64])
      // and the dot grows to say so
      expect(dot(1)).toHaveAttribute("data-accent", "+")
    })

    it("snaps a point dropped near an accent's velocity onto it", () => {
      setup(null, withNotes)
      // within a quarter of the accent amount: five either side of 44
      dragFrom([firstBar, Y(64)], [[firstBar, Y(40)]])
      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "-",
        velocityOffset: 0,
      })
      expect(velocities()[0]).toBe(44)
    })

    it("shows a dot's own velocity as the level it is nearest", () => {
      setup(null, withNotes)
      // well past either accent, as dragged in the report: 34 and 100
      dragFrom([firstBar, Y(64)], [[firstBar, Y(34)]])
      dragFrom([secondBar, Y(64)], [[secondBar, Y(100)]])

      expect(velocities()).toEqual([34, 100])
      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "none",
        velocityOffset: -30,
      })
      // nearer 44 than 64 reads small, nearer 84 than 64 reads big
      expect(dot(1)).toHaveAttribute("data-accent", "-")
      expect(dot(1)).toHaveClass("scale-80")
      expect(dot(2)).toHaveAttribute("data-accent", "+")
      expect(dot(2)).toHaveClass("scale-[1.15]")
    })

    it("keeps a point between the levels as the dot's own, at its size", () => {
      setup(null, withNotes)
      dragFrom([firstBar, Y(64)], [[firstBar, Y(72)]])

      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "none",
        velocityOffset: 8,
      })
      expect(velocities()[0]).toBe(72)
      expect(dot(1)).toHaveAttribute("data-accent", "none")
      expect(dot(1).title).toContain("Velocity 72")
    })

    it("returns a clicked point's note to the voice's velocity", () => {
      setup(null, withNotes)
      dragFrom([secondBar, Y(64)], [[secondBar, Y(100)]])
      expect(velocities()).toEqual([64, 100])

      clickAt(secondBar, Y(100))
      expect(velocities()).toEqual([64, 64])
      expect(patch().voices[0].pattern[1]).toMatchObject({
        accent: "none",
        velocityOffset: 0,
      })
    })

    it("adds no point where the line is clicked", () => {
      setup(null, withNotes)
      const before = patch()
      clickAt(X(0.25), Y(64))
      fireEvent.mouseDown(svg(), {
        clientX: X(0.75),
        clientY: Y(20),
        detail: 2,
      })
      fireEvent.mouseUp(document)
      expect(patch()).toBe(before)
      expect(velocities()).toEqual([64, 64])
    })

    it("raises the notes at both ends of a stretch of line dragged", () => {
      setup(null, withNotes)
      dragFrom([X(0.25), Y(64)], [[X(0.25), Y(74)]])
      expect(velocities()).toEqual([74, 74])
    })

    it("moves every point from one dot together", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[0].pattern[0] = { ...next.voices[0].pattern[0], ratchet: 2 }
        return next
      })
      // the first dot's two hits, then the second dot
      expect(velocities()).toEqual([64, 64, 64])
      dragFrom([firstBar, Y(64)], [[firstBar, Y(30)]])
      expect(velocities()).toEqual([30, 30, 64])
    })

    it("paints every note a Draw stroke crosses", () => {
      setup(null, withNotes)
      click("Draw")
      dragFrom(
        [X(0.25), Y(30)],
        [
          [X(0.4), Y(30)],
          [X(0.75), Y(30)],
        ],
      )
      // only the second note lies on the stroke's way
      expect(velocities()).toEqual([64, 30])
    })

    it("makes a whole drag one undo entry", () => {
      setup(null, withNotes)
      const before = patch()
      dragFrom(
        [firstBar, Y(64)],
        [
          [firstBar, Y(70)],
          [firstBar, Y(90)],
          [firstBar, Y(100)],
        ],
      )
      fireEvent.click(editItem("Undo"))
      expect(patch()).toBe(before)
    })

    it("switches to Draw with B, as on an envelope", () => {
      setup(null, withNotes)
      frame().focus()
      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(frame()).toHaveAttribute("data-tool", "draw")
      expect(rootStore.player.actions.bump).toBe(false)
      fireEvent.keyUp(frame(), { code: "KeyB" })
    })

    it("follows the voice of a dot that is edited", () => {
      setup(null, withNotes)
      fireEvent.click(screen.getByRole("button", { name: "Voice 3 Dot 2" }))
      expect(tab("Velocity 3")).toHaveAttribute("aria-selected", "true")

      fireEvent.contextMenu(
        screen.getByRole("button", { name: "Voice 2 Dot 1" }),
      )
      expect(tab("Velocity 2")).toHaveAttribute("aria-selected", "true")
    })

    it("leaves an open CC where it is when a dot is edited", () => {
      setup(ramp, withNotes)
      fireEvent.click(screen.getByRole("button", { name: "Voice 3 Dot 2" }))
      expect(tab("CC 74")).toHaveAttribute("aria-selected", "true")
    })

    it("follows an accent picked on the dot", () => {
      setup(null, withNotes)
      fireEvent.contextMenu(dot(2))
      const options = within(
        screen.getByRole("dialog", { name: "Voice 1 Dot 2" }),
      )
      fireEvent.change(options.getByLabelText("Accent"), {
        target: { value: "-" },
      })
      expect(velocities()).toEqual([64, 44])
    })

    it("takes a velocity typed in the dot's options, exactly", () => {
      setup(null, withNotes)
      fireEvent.contextMenu(dot(2))
      const options = within(
        screen.getByRole("dialog", { name: "Voice 1 Dot 2" }),
      )
      const field = options.getByRole("textbox", { name: "Velocity" })
      expect(field).toHaveValue("64")

      // near the + accent's 84, but kept as typed
      fireEvent.focus(field)
      fireEvent.change(field, { target: { value: "83" } })
      fireEvent.keyDown(field, { key: "Enter" })
      expect(velocities()).toEqual([64, 83])
      expect(patch().voices[0].pattern[1]).toMatchObject({
        accent: "none",
        velocityOffset: 19,
      })

      // one more lands on the accent
      fireEvent.click(options.getByRole("button", { name: "Velocity up" }))
      expect(patch().voices[0].pattern[1]).toMatchObject({
        accent: "+",
        velocityOffset: 0,
      })
      expect(options.getByLabelText("Accent")).toHaveValue("+")
    })

    it("follows the voice's velocity and the accent amount", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[0].pattern[0] = {
          ...next.voices[0].pattern[0],
          accent: "+",
        }
        return next
      })
      expect(velocities()).toEqual([84, 64])

      act(() => rootStore.playbackSettings.setAccentAmount(30))
      expect(velocities()).toEqual([94, 64])

      const voices = within(screen.getByRole("region", { name: "Voices" }))
      fireEvent.click(voices.getByRole("button", { name: "Velocity up" }))
      expect(velocities()).toEqual([95, 65])
    })

    it("shows only its own voice's notes, even where an older patch shares a channel", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[1] = {
          ...next.voices[1],
          enabled: true,
          channel: 1,
          pace: "4th",
          velocity: 100,
        }
        return next
      })
      expect(velocities()).toEqual([64, 64])
      fireEvent.click(screen.getByRole("tab", { name: "Velocity 2" }))
      expect(velocities()).toEqual([100])
    })
  })
})

describe("recording into the editor", () => {
  const openTab = () =>
    screen
      .getAllByRole("tab")
      .find((tab) => tab.getAttribute("aria-selected") === "true")
      ?.textContent?.trim()
  const handles = () => svg().querySelectorAll("[data-point]").length

  it("opens a knob's tab and shows its values as they arrive", () => {
    setup(null)
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
