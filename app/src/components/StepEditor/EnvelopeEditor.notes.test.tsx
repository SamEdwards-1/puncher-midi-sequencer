import {
  addEnvelope,
  createDefaultPatch,
  ModulationJSON,
  modulationCC,
  PatchJSON,
  setModulation,
  setStepNotes,
} from "@midiseq/core"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { FakeClock, immediateStepWork, ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const svg = () =>
  screen
    .getByRole("application", { name: "Envelope" })
    .querySelector("svg") as SVGSVGElement
const dot = (voice: number, number: number) =>
  screen.getByRole("button", { name: `Voice ${voice} Dot ${number}` })
// the dots showing a music note
const marked = () =>
  [...document.querySelectorAll("[data-note-mark]")].map((mark) =>
    mark.closest("button")?.getAttribute("aria-label"),
  )
// a voice's notes in the roll, in time order
const bars = (voice: number) =>
  [...svg().querySelectorAll(`[data-note][data-voice="${voice - 1}"]`)].sort(
    (a, b) => Number(a.getAttribute("x")) - Number(b.getAttribute("x")),
  )
// jsdom has no layout, so the graph sits at the page's corner and a
// position on it is one on the page
const middle = (bar: Element) => ({
  clientX:
    Number(bar.getAttribute("x")) + Number(bar.getAttribute("width")) / 2,
  clientY:
    Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) / 2,
})
// the bottom of a bar, clear of a line through its middle
const foot = (bar: Element) => ({
  clientX: middle(bar).clientX,
  clientY:
    Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) - 1,
})
const pointAt = (at: { clientX: number; clientY: number }) =>
  fireEvent.mouseMove(svg(), at)
// the graph is its fallback 480 by 240, inset by 6
const Y = (value: number) => 6 + (1 - value / 127) * 228

/**
 * A quarter-note sequencer whose step 1 holds C4 and E4: voice 1 takes the
 * lower, C4, on each of its first two dots, 8ths at half length. Step 1 is
 * opened on `tab`, with the Edit tool, which lives on from test to test.
 */
const setup = (
  change: (patch: PatchJSON) => PatchJSON = (patch) => patch,
  tab = "Velocity 1",
) => {
  const clock = new FakeClock()
  clock.time = 1000
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    now: clock.now,
    storage: null,
    stepWork: immediateStepWork(),
  })
  rootStore.sequencerStore.patch = change(
    setStepNotes({ ...createDefaultPatch(), pace: "4th" }, 0, [60, 64]),
  )
  render(<App rootStore={rootStore} />)
  fireEvent.click(screen.getByRole("button", { name: "Step 1" }))
  fireEvent.click(screen.getByRole("tab", { name: tab }))
  fireEvent.click(screen.getByRole("button", { name: "Edit points" }))
}

// a flat CC 74 line across step 1, through the middle of C4's row
const lineThroughC4 = (patch: PatchJSON) =>
  addEnvelope(patch, 0, {
    cc: 74,
    channel: 1,
    shape: "ramps",
    points: [{ time: 0, value: 13 }],
  })

describe("pointing at a note in the piano roll", () => {
  it("marks the dot that played it with a music note", () => {
    setup()
    const [first, second] = bars(1)
    expect(marked()).toEqual([])

    pointAt(middle(first))
    expect(marked()).toEqual(["Voice 1 Dot 1"])
    pointAt(middle(second))
    expect(marked()).toEqual(["Voice 1 Dot 2"])

    fireEvent.mouseLeave(svg())
    expect(marked()).toEqual([])
  })

  it("bounces the marked dot as its music note appears", () => {
    setup()
    const [first, second] = bars(1)
    pointAt(middle(first))
    expect(dot(1, 1)).toHaveClass("dot-pulse")
    expect(dot(1, 2)).not.toHaveClass("dot-pulse")

    pointAt(middle(second))
    expect(dot(1, 1)).not.toHaveClass("dot-pulse")
    expect(dot(1, 2)).toHaveClass("dot-pulse")
  })

  it("draws the note pointed at in the text's colour, over the rest", () => {
    setup()
    const [first, second] = bars(1)
    pointAt(middle(first))
    expect(first).toHaveAttribute("data-pointed", "true")
    expect(first).toHaveAttribute("fill", "var(--midiseq-fg)")
    // out of the velocity lane's dimming, unlike the note beside it
    expect(first).not.toHaveAttribute("fill-opacity")
    expect(second).toHaveAttribute("fill", "var(--midiseq-voice-0)")
    expect(second).toHaveAttribute("fill-opacity", "0.25")
    // drawn last, so nothing lies over it
    const drawn = svg().querySelectorAll("[data-note]")
    expect(drawn[drawn.length - 1]).toBe(first)

    fireEvent.mouseLeave(svg())
    expect(first).toHaveAttribute("fill", "var(--midiseq-voice-0)")
    expect(first).toHaveAttribute("fill-opacity", "0.25")
  })

  it("marks another voice's dot", () => {
    setup((patch) => {
      // voice 2 takes the upper note, E4, a quarter note long
      patch.voices[1] = { ...patch.voices[1], enabled: true, pace: "4th" }
      return patch
    })
    pointAt(middle(bars(2)[0]))
    expect(marked()).toEqual(["Voice 2 Dot 1"])
  })

  it("marks the dot of a lollipop pointed at", () => {
    setup()
    // the second note's head, at its start and up at its velocity, well
    // clear of its bar
    const head = svg()
      .querySelectorAll("[data-point]")[1]
      .querySelector("circle") as SVGCircleElement
    pointAt({
      clientX: Number(head.getAttribute("cx")),
      clientY: Number(head.getAttribute("cy")),
    })
    expect(marked()).toEqual(["Voice 1 Dot 2"])
    // and its note stands out in the roll below
    expect(bars(1)[1]).toHaveAttribute("fill", "var(--midiseq-fg)")
    expect(bars(1)[0]).toHaveAttribute("fill", "var(--midiseq-voice-0)")
  })

  it("leaves a note under the envelope's line to the line", () => {
    setup(lineThroughC4, "CC 74")
    const bar = bars(1)[0]

    pointAt({ clientX: middle(bar).clientX, clientY: Y(13) })
    expect(marked()).toEqual([])
    pointAt(foot(bar))
    expect(marked()).toEqual(["Voice 1 Dot 1"])
  })

  it("marks nothing while a stroke is drawn", () => {
    setup(lineThroughC4, "CC 74")
    fireEvent.click(screen.getByRole("button", { name: "Draw" }))
    const at = foot(bars(1)[1])
    pointAt(at)
    expect(marked()).toEqual(["Voice 1 Dot 2"])

    fireEvent.mouseDown(svg(), { ...at, button: 0, detail: 1 })
    fireEvent.mouseMove(svg(), { ...at, buttons: 1 })
    expect(marked()).toEqual([])
    fireEvent.mouseUp(document, at)
  })

  it("marks nothing while the sequence runs, and marks again once paused", () => {
    setup()
    const at = middle(bars(1)[0])
    pointAt(at)
    expect(marked()).toEqual(["Voice 1 Dot 1"])

    act(() => rootStore.player.play())
    expect(marked()).toEqual([])
    pointAt(at)
    expect(marked()).toEqual([])

    act(() => rootStore.player.pause())
    pointAt(at)
    expect(marked()).toEqual(["Voice 1 Dot 1"])

    act(() => rootStore.player.stop())
    pointAt(at)
    expect(marked()).toEqual(["Voice 1 Dot 1"])
  })

  it("draws the note in a colour that stands out on the dot", () => {
    setup((patch) => {
      // played only sometimes, so hollow, though it plays here
      patch.voices[0].pattern[1] = {
        ...patch.voices[0].pattern[1],
        probability: 90,
      }
      return patch
    })
    const [first, second] = bars(1)

    pointAt(middle(first))
    const filled = dot(1, 1).querySelector("[data-note-mark]")
    // on the voice's colour, as a ratchet count is
    expect(filled).toHaveClass("text-on-surface")
    expect(filled?.querySelector("svg")).toHaveAttribute("fill", "currentColor")

    pointAt(middle(second))
    expect(dot(1, 2)).toHaveAttribute("data-chance", "true")
    // only an outline, with the panel showing through: the text's colour
    expect(dot(1, 2).querySelector("[data-note-mark]")).toHaveClass("text-fg")
  })

  it("stands in for a ratchet count while it shows", () => {
    setup((patch) => {
      patch.voices[0].pattern[0] = { ...patch.voices[0].pattern[0], ratchet: 2 }
      return patch
    })
    expect(dot(1, 1)).toHaveTextContent("2")

    pointAt(middle(bars(1)[0]))
    expect(marked()).toEqual(["Voice 1 Dot 1"])
    expect(dot(1, 1)).not.toHaveTextContent("2")

    fireEvent.mouseLeave(svg())
    expect(dot(1, 1)).toHaveTextContent("2")
  })

  it("shows a dot past the pattern's end whole while marked", () => {
    // voice 1's pattern is a dot long, but step 1 lengthens it to two
    const modulation: ModulationJSON = {
      target: { kind: "voice", voice: 0, setting: "patternLength" },
      cc: 3,
      from: 1,
      to: 16,
    }
    setup((patch) => {
      patch.voices[0] = { ...patch.voices[0], patternLength: 1 }
      return addEnvelope(setModulation(patch, modulation), 0, {
        cc: 3,
        channel: 1,
        points: [{ time: 0, value: modulationCC(modulation, 2) }],
      })
    })
    expect(dot(1, 2)).toHaveAttribute("data-beyond", "true")
    expect(dot(1, 2)).toHaveClass("opacity-25")

    pointAt(middle(bars(1)[1]))
    expect(marked()).toEqual(["Voice 1 Dot 2"])
    expect(dot(1, 2)).not.toHaveClass("opacity-25")
  })
})

describe("pointing at a pattern dot", () => {
  it("brings its notes up out of a velocity lane's dimmed ones", () => {
    setup()
    const [first, second] = bars(1)
    expect(second).toHaveAttribute("fill-opacity", "0.25")

    fireEvent.mouseEnter(dot(1, 2))
    expect(second).toHaveAttribute("data-lit", "true")
    expect(second).not.toHaveAttribute("fill-opacity")
    // in its voice's own colour, and the rest left dimmed
    expect(second).toHaveAttribute("fill", "var(--midiseq-voice-0)")
    expect(first).toHaveAttribute("fill-opacity", "0.25")

    fireEvent.mouseLeave(dot(1, 2))
    expect(second).toHaveAttribute("fill-opacity", "0.25")
  })

  it("brings up another voice's notes too", () => {
    setup((patch) => {
      patch.voices[1] = { ...patch.voices[1], enabled: true, pace: "4th" }
      return patch
    })
    fireEvent.mouseEnter(dot(2, 1))
    expect(bars(2)[0]).not.toHaveAttribute("fill-opacity")
    expect(bars(1)[0]).toHaveAttribute("fill-opacity", "0.25")
  })

  it("brings up nothing for a dot that plays nothing on the step", () => {
    setup()
    fireEvent.mouseEnter(dot(1, 5))
    expect(svg().querySelectorAll("[data-lit]")).toHaveLength(0)
  })

  it("leaves a CC lane's notes, never dimmed, as they are", () => {
    setup(lineThroughC4, "CC 74")
    fireEvent.mouseEnter(dot(1, 2))
    for (const bar of bars(1)) {
      expect(bar).not.toHaveAttribute("fill-opacity")
      expect(bar).toHaveAttribute("fill", "var(--midiseq-voice-0)")
    }
  })
})
