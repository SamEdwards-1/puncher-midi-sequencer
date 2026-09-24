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
    // settings such as the accent amount start fresh for every test
    storage: null,
  })
  let start: PatchJSON = { ...createDefaultPatch(), pace: "4th" }
  if (shape !== null) {
    start = addEnvelope(start, 0, { cc: 74, channel: 1, points: shape })
  }
  rootStore.sequencerStore.patch = change(start)
  render(<App rootStore={rootStore} />)
  fireEvent.click(screen.getByRole("button", { name: "Step 1" }))
  // the channel, lane and tool are view state and live on past a render
  pickChannel(1)
  if (shape !== null) {
    fireEvent.click(screen.getByRole("tab", { name: "CC 74" }))
    click("Edit")
  }
}

const channelPicker = () =>
  screen.getByRole("combobox", { name: "Channel" }) as HTMLSelectElement
const pickChannel = (channel: number) =>
  fireEvent.change(channelPicker(), { target: { value: String(channel) } })
const tab = (name: string) => screen.queryByRole("tab", { name })

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
    it("offers all 16 channels, naming the voices on each", () => {
      setup(null)
      const options = [...channelPicker().options].map(({ text }) => text)
      expect(options).toHaveLength(16)
      expect(options.slice(0, 5)).toEqual([
        "1 · Voice 1",
        "2 · Voice 2",
        "3 · Voice 3",
        "4 · Voice 4",
        "5",
      ])
    })

    it("gives every voice's channel a Velocity lane, open first", () => {
      setup(null)
      for (const channel of [1, 2, 3, 4]) {
        pickChannel(channel)
        expect(tab("Velocity")).toHaveAttribute("aria-selected", "true")
      }
    })

    it("has no Velocity lane on a channel no voice plays on, and says so", () => {
      setup(null)
      pickChannel(5)
      expect(tab("Velocity")).toBeNull()
      expect(
        screen.getByText(/No voice plays on this channel/),
      ).toBeInTheDocument()
    })

    it("adds a CC on the chosen channel, and shows each channel its own", () => {
      setup(null)
      pickChannel(5)
      click("Add CC")
      expect(envelopes()).toMatchObject([{ cc: 74, channel: 5 }])
      expect(tab("CC 74")).toHaveAttribute("aria-selected", "true")
      expect(channelPicker().options[4].text).toBe("5 · 1 CC")

      pickChannel(1)
      expect(tab("CC 74")).toBeNull()
      // and the same number is free again on another channel
      click("Add CC")
      expect(envelopes().map(({ cc, channel }) => [cc, channel])).toEqual([
        [74, 5],
        [74, 1],
      ])
    })

    it("keeps a CC on its channel when a voice moves off it", () => {
      setup(null, (start) =>
        addEnvelope(start, 0, { cc: 1, channel: 2, points: [] }),
      )
      rootStore.sequencerStore.patch = {
        ...patch(),
        voices: patch().voices.map((voice, index) =>
          index === 1 ? { ...voice, channel: 9 } : voice,
        ),
      }
      pickChannel(2)
      expect(tab("Velocity")).toBeNull()
      expect(tab("CC 1")).toBeInTheDocument()
      expect(channelPicker().options[1].text).toBe("2 · 1 CC")
      expect(channelPicker().options[8].text).toBe("9 · Voice 2")
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

  describe("velocity", () => {
    // voice 1 plays 8ths across the quarter-note step: bars at 0 and a half
    const withNotes = (start: PatchJSON) => setStepNotes(start, 0, [60, 64])
    const bars = () => [...svg().querySelectorAll("[data-bar]")]
    const velocities = () =>
      bars().map((bar) => Number(bar.getAttribute("data-velocity")))
    const dot = (number: number) =>
      screen.getByRole("button", { name: `Voice 1 Dot ${number}` })
    const firstBar = X(0) + 2
    const secondBar = X(0.5) + 2

    it("shows a bar at each of the channel's notes, at its velocity", () => {
      setup(null, withNotes)
      expect(tab("Velocity")).toHaveAttribute("aria-selected", "true")
      expect(velocities()).toEqual([64, 64])
      expect(bars()[1]).toHaveAttribute("x", String(X(0.5)))
    })

    it("marks where a bar is plain and where it is either accent", () => {
      setup(null, withNotes)
      const levels = [...svg().querySelectorAll("[data-level]")].map((line) =>
        Number(line.getAttribute("data-level")),
      )
      expect(levels).toEqual([44, 64, 84])
    })

    it("makes a bar dragged onto an accent's velocity that accent", () => {
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

    it("counts a couple either side of an accent as the accent", () => {
      setup(null, withNotes)
      dragFrom([firstBar, Y(64)], [[firstBar, Y(42)]])
      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "-",
        velocityOffset: 0,
      })
      expect(velocities()[0]).toBe(44)
    })

    it("keeps a bar between the levels as the dot's own, at its size", () => {
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

    it("sets a bar as soon as it is pressed, like Signal", () => {
      setup(null, withNotes)
      clickAt(secondBar, Y(100))
      expect(velocities()).toEqual([64, 100])
    })

    it("moves every bar from one dot together", () => {
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

    it("paints every bar a stroke crosses from between them", () => {
      setup(null, withNotes)
      dragFrom(
        [X(0.25), Y(30)],
        [
          [X(0.4), Y(30)],
          [X(0.75), Y(30)],
        ],
      )
      // only the second bar lies on the stroke's way
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
      click("Undo")
      expect(patch()).toBe(before)
    })

    it("leaves B as Bump, since Velocity has no tools", () => {
      setup(null, withNotes)
      frame().focus()
      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(rootStore.player.actions.bump).toBe(true)
      fireEvent.keyUp(frame(), { code: "KeyB" })
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

    it("shares one channel's lane between the voices on it", () => {
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
      expect(channelPicker().options[0].text).toBe("1 · Voices 1, 2")
      const voicesOfBars = bars().map((bar) => bar.getAttribute("data-voice"))
      expect(voicesOfBars.sort()).toEqual(["0", "0", "1"])
      expect(velocities()).toContain(100)
    })
  })
})
