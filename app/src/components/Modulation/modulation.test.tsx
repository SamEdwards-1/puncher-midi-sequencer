import { createDefaultPatch, PatchJSON } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch

// jsdom has no layout, so the graph is its fallback 480 by 240, inset by 6
const X = (time: number) => 6 + time * 468
const Y = (value: number) => 6 + (1 - value / 127) * 228

const voices = () => within(screen.getByRole("region", { name: "Voices" }))
const sequencer = () =>
  within(screen.getByRole("region", { name: "Sequencer" }))
const gear = (name: string) =>
  screen.getByRole("button", { name: `Modulation settings: ${name}` })
const popover = (name: string) =>
  within(screen.getByRole("dialog", { name: `Modulation: ${name}` }))
const choose = (label: string, text: string) => {
  const select = screen.getByLabelText(label) as HTMLSelectElement
  const option = [...select.options].find((each) => each.text === text)
  fireEvent.change(select, { target: { value: option?.value } })
}
const typeInto = (label: string, text: string) => {
  const field = screen.getByLabelText(label)
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: "Enter" })
}
const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .map((tab) => tab.textContent)
const svg = () =>
  screen
    .getByRole("application", { name: "Envelope" })
    .querySelector("svg") as SVGSVGElement
const axis = () =>
  [...document.querySelectorAll("[data-axis-value]")].map(
    (each) => each.textContent,
  )

const setup = (change: (patch: PatchJSON) => PatchJSON = (each) => each) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  rootStore.sequencerStore.patch = change({
    ...createDefaultPatch(),
    pace: "1bar",
  })
  render(<App rootStore={rootStore} />)
  // the voice, step and lane are view state and live on past a render
  fireEvent.click(screen.getByRole("button", { name: "Voice 1" }))
  fireEvent.click(screen.getByRole("button", { name: "Step 5" }))
  fireEvent.click(screen.getByRole("tab", { name: "Velocity 1" }))
}

// Voice 1's pace over seven paces, 4th to 16th: CC 64 is an 8th, the
// voice's own pace.
const modulatePace = () => {
  fireEvent.click(gear("Voice 1 · Pace"))
  choose("Voice 1 · Pace From", "4th")
  choose("Voice 1 · Pace To", "16th")
  fireEvent.click(
    popover("Voice 1 · Pace").getByRole("button", { name: "Modulate" }),
  )
}

const scrolled = vi.fn()

beforeEach(() => {
  scrolled.mockClear()
  // jsdom lays nothing out, so it has no scrolling to do
  Element.prototype.scrollIntoView = scrolled
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("modulating a setting", () => {
  it("offers a gear beside each setting a CC can drive", () => {
    setup()
    for (const setting of [
      "Pace",
      "Length",
      "Rule",
      "Offset",
      "Offset scale fit",
      "Pattern",
    ]) {
      expect(
        voices().getByRole("button", {
          name: `Modulation settings: Voice 1 · ${setting}`,
        }),
      ).toBeInTheDocument()
    }
    for (const setting of ["Pace", "Scale", "Shift scale fit"]) {
      expect(
        sequencer().getByRole("button", {
          name: `Modulation settings: Sequencer · ${setting}`,
        }),
      ).toBeInTheDocument()
    }
    // the gear takes no part in naming its field
    expect(voices().getByLabelText("Pace")).toHaveValue("8th")
  })

  it("offers the next undefined CC, across all of the setting's values", () => {
    setup()
    fireEvent.click(gear("Voice 1 · Pace"))
    const shown = popover("Voice 1 · Pace")
    expect(shown.getByLabelText("Voice 1 · Pace CC")).toHaveValue("3")
    expect(shown.getByText("Undefined (MSB)")).toBeInTheDocument()
    expect(shown.getByLabelText("Voice 1 · Pace From")).toHaveDisplayValue(
      "16 Bars",
    )
    expect(shown.getByLabelText("Voice 1 · Pace To")).toHaveDisplayValue(
      "32nd T",
    )
    expect(shown.getByText(/20 values/)).toBeInTheDocument()
  })

  it("skips a CC the patch already uses", () => {
    setup((each) => ({
      ...each,
      modulations: [
        {
          target: { kind: "voice", voice: 1, setting: "rule" },
          cc: 3,
          from: "nth",
          to: "fall",
        },
      ],
    }))
    fireEvent.click(gear("Voice 1 · Pace"))
    expect(screen.getByLabelText("Voice 1 · Pace CC")).toHaveValue("9")
  })

  it("drives the setting from the CC, and opens its envelope on the step in view", () => {
    setup()
    modulatePace()

    expect(patch().modulations).toEqual([
      {
        target: { kind: "voice", voice: 0, setting: "pace" },
        cc: 3,
        from: "4th",
        to: "16th",
      },
    ])
    // starting at the voice's own pace, so nothing changes yet
    expect(patch().steps[4].envelopes).toMatchObject([
      { cc: 3, channel: 1, points: [{ time: 0, value: 64 }] },
    ])
    expect(selectedTab()).toEqual(["Pace 1"])
    expect(screen.getByText("Modulates Voice 1 · Pace")).toBeInTheDocument()
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" })
    // lit, now it is modulated
    expect(gear("Voice 1 · Pace")).toHaveAttribute("data-modulated", "true")
    expect(gear("Voice 1 · Pace")).toHaveAttribute("title", "Modulated by CC 3")
  })

  it("names the setting's values down the envelope's side", () => {
    setup()
    modulatePace()
    expect(axis()).toEqual([
      "4th",
      "8th D",
      "4th T",
      "8th",
      "16th D",
      "8th T",
      "16th",
    ])
    // and the setting's own value, which a step without the envelope plays
    expect(svg().querySelector("[data-own-value]")).toHaveAttribute(
      "data-own-value",
      "64",
    )
  })

  it("snaps the envelope's points to the setting's values", () => {
    setup()
    modulatePace()
    fireEvent.mouseDown(svg(), {
      clientX: X(0),
      clientY: Y(64),
      button: 0,
      detail: 1,
    })
    fireEvent.mouseMove(document, { clientX: X(0), clientY: Y(30) })
    fireEvent.mouseUp(document, { clientX: X(0), clientY: Y(30) })
    // 30 lies nearest the 8th D's 21
    expect(patch().steps[4].envelopes[0].points).toEqual([
      { time: 0, value: 21 },
    ])
  })

  it("reads a value out by name", () => {
    setup()
    modulatePace()
    fireEvent.mouseMove(svg(), { clientX: X(0), clientY: Y(64) })
    expect(svg().querySelector("[data-envelope-label]")).toHaveAttribute(
      "data-envelope-label",
      "8th",
    )
  })

  it("changes as it is edited once it drives the setting, its envelopes kept where they were", () => {
    setup()
    modulatePace()
    // the popover stays open: 4th to 8th now, where the 8th is the last
    choose("Voice 1 · Pace To", "8th")
    expect(patch().modulations[0].to).toBe("8th")
    expect(patch().steps[4].envelopes[0].points).toEqual([
      { time: 0, value: 127 },
    ])
    expect(axis()).toEqual(["4th", "8th D", "4th T", "8th"])
  })

  it("won't drive two settings from one CC", () => {
    setup()
    modulatePace()
    fireEvent.click(gear("Voice 1 · Length"))
    typeInto("Voice 1 · Length CC", "3")
    const shown = popover("Voice 1 · Length")
    expect(shown.getByRole("alert")).toHaveTextContent(
      "CC 3: Already modulates Voice 1 · Pace",
    )
    expect(shown.getByRole("button", { name: "Modulate" })).toBeDisabled()
  })

  it("takes a new modulation and its envelope back in one undo", () => {
    setup()
    modulatePace()
    fireEvent.click(editItem("Undo"))
    expect(patch().modulations).toEqual([])
    expect(patch().steps[4].envelopes).toEqual([])
  })

  it("stops, leaving its envelopes as CCs", () => {
    setup()
    modulatePace()
    fireEvent.click(
      popover("Voice 1 · Pace").getByRole("button", { name: "Remove" }),
    )
    expect(patch().modulations).toEqual([])
    expect(patch().steps[4].envelopes).toHaveLength(1)
    expect(gear("Voice 1 · Pace")).toHaveAttribute("data-modulated", "false")
    expect(screen.getByRole("tab", { name: "CC 3" })).toBeInTheDocument()
  })

  it("shows a modulated setting's envelope on another step, from its gear", () => {
    setup()
    modulatePace()
    fireEvent.click(screen.getByRole("button", { name: "Step 9" }))
    fireEvent.click(
      popover("Voice 1 · Pace").getByRole("button", {
        name: "Show on step 9",
      }),
    )
    expect(patch().steps[8].envelopes).toMatchObject([
      { cc: 3, points: [{ time: 0, value: 64 }] },
    ])
  })
})

describe("the sequencer's scale", () => {
  it("offers the ten scales its modulation reaches at every tonic", () => {
    setup()
    const names = sequencer().getByLabelText("Scale") as HTMLSelectElement
    expect([...names.options].map((option) => option.text)).toEqual([
      "None",
      "major",
      "minor",
      "dorian",
      "phrygian",
      "lydian",
      "mixolydian",
      "harmonic minor",
      "major pentatonic",
      "minor pentatonic",
      "minor blues",
    ])

    fireEvent.click(gear("Sequencer · Scale"))
    const from = screen.getByLabelText("Sequencer · Scale From")
    expect((from as HTMLSelectElement).options).toHaveLength(121)
    // with no scale, from none to C's last
    expect(from).toHaveDisplayValue("None")
    expect(screen.getByLabelText("Sequencer · Scale To")).toHaveDisplayValue(
      "C minor blues",
    )
  })
})

describe("in one column", () => {
  it("brings the envelope editor forward from the Voices tab", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0) <= 875,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    rootStore = new RootStore({
      requestMIDIAccess: null,
      ticker: new ManualTicker(),
      storage: null,
    })
    rootStore.sequencerStore.patch = createDefaultPatch()
    render(<App rootStore={rootStore} />)
    fireEvent.click(screen.getByRole("tab", { name: "Voices" }))
    expect(screen.queryByRole("application", { name: "Envelope" })).toBeNull()

    fireEvent.click(gear("Voice 1 · Length"))
    fireEvent.click(screen.getByRole("button", { name: "Modulate" }))

    expect(screen.getByRole("tab", { name: "Grid" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByRole("tab", { name: "Length 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(scrolled).toHaveBeenCalled()
  })
})
