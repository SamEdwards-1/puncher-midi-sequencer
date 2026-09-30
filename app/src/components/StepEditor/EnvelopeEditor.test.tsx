import { addEnvelope, EnvelopePointJSON, PatchJSON } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  click,
  clickAt,
  dragFrom,
  envelopes,
  frame,
  moveTo,
  openEditor,
  patch,
  points,
  press,
  ramp,
  release,
  startStore,
  svg,
  tab,
  type,
  X,
  Y,
} from "../../test/envelopeEditor"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

const setup = (
  shape: EnvelopePointJSON[] | null = ramp,
  change: (patch: PatchJSON) => PatchJSON = (patch) => patch,
) => {
  render(<App rootStore={startStore(shape, change)} />)
  openEditor(shape)
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
      expect(voices.getByRole("textbox", { name: "Velocity" })).toHaveValue(
        "89",
      )
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

    it("switches tools with B while the graph has focus", () => {
      setup()
      const draw = screen.getByRole("button", { name: "Draw" })
      frame().focus()

      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(draw).toHaveAttribute("aria-pressed", "true")
      fireEvent.keyUp(frame(), { code: "KeyB" })

      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(draw).toHaveAttribute("aria-pressed", "false")
    })
  })
})
