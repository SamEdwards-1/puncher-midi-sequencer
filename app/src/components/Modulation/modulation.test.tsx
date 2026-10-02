import {
  addEnvelope,
  createDefaultPatch,
  ModulationJSON,
  PatchJSON,
} from "@midiseq/core"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { choose as chooseIn, comboOptions } from "../../test/combobox"
import { ManualTicker } from "../../test/fakes"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

let rootStore: RootStore
let ticker: ManualTicker
let now = 0

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
  now = 0
  ticker = new ManualTicker()
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker,
    now: () => now,
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
  it.each([
    ["Size", "size", "1", "64"],
    ["Direction", "direction", "Forwards", "Random+"],
    ["Loop", "loop", "Recorded", "Custom"],
    ["Transpose", "transposeAmt", "-24", "+24"],
    ["Step notes", "maxNotesPerStep", "1", "4"],
  ])("creates a modulation for %s with its full range", (label, setting, from, to) => {
    setup()
    const name = `Sequencer · ${label}`
    fireEvent.click(gear(name))
    const shown = popover(name)
    expect(shown.getByLabelText(`${name} From`)).toHaveDisplayValue(from)
    expect(shown.getByLabelText(`${name} To`)).toHaveDisplayValue(to)
    fireEvent.click(shown.getByRole("button", { name: "Modulate" }))
    expect(patch().modulations).toEqual([
      expect.objectContaining({ target: { kind: "sequencer", setting } }),
    ])
    fireEvent.click(editItem("Undo"))
    expect(patch().modulations).toEqual([])
  })
  it("offers a gear beside each setting a CC can drive", () => {
    setup()
    for (const setting of [
      "Pace",
      "Length",
      "Rule",
      "Transpose",
      "Transpose fit",
      "Pattern",
    ]) {
      expect(
        voices().getByRole("button", {
          name: `Modulation settings: Voice 1 · ${setting}`,
        }),
      ).toBeInTheDocument()
    }
    for (const setting of [
      "Pace",
      "Scale",
      "Transpose fit",
      "Size",
      "Direction",
      "Loop",
      "Transpose",
      "Step notes",
    ]) {
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

describe("taking a modulation away in the envelope editor", () => {
  const removeCC = () => screen.getByRole("button", { name: "Remove CC" })

  it("takes the modulation with the last envelope for its CC", () => {
    setup()
    modulatePace()
    // the popover is still open, and says where the CC is
    const shown = popover("Voice 1 · Pace")
    expect(shown.getByText("On step 5")).toBeInTheDocument()
    expect(removeCC()).toHaveAttribute(
      "title",
      "Remove CC, and the modulation of Voice 1 · Pace",
    )

    fireEvent.click(removeCC())
    expect(patch().steps[4].envelopes).toEqual([])
    expect(patch().modulations).toEqual([])
    // the popover follows, offering the setting its CC afresh
    expect(shown.getByRole("button", { name: "Modulate" })).toBeInTheDocument()
    expect(shown.getByLabelText("Voice 1 · Pace CC")).toHaveValue("3")
    // and once it is shut, the gear hides again until its label is hovered
    fireEvent.keyDown(window, { key: "Escape" })
    expect(gear("Voice 1 · Pace")).toHaveAttribute("data-modulated", "false")
    expect(gear("Voice 1 · Pace").className).toContain("opacity-0")

    // one undo brings both back
    fireEvent.click(editItem("Undo"))
    expect(patch().modulations).toHaveLength(1)
    expect(patch().steps[4].envelopes).toHaveLength(1)
  })

  it("keeps the modulation while another step has its envelope", () => {
    setup()
    modulatePace()
    fireEvent.click(screen.getByRole("button", { name: "Step 9" }))
    fireEvent.click(
      popover("Voice 1 · Pace").getByRole("button", {
        name: "Show on step 9",
      }),
    )
    expect(
      popover("Voice 1 · Pace").getByText("On steps 5, 9"),
    ).toBeInTheDocument()
    expect(removeCC()).toHaveAttribute("title", "Remove CC")

    fireEvent.click(removeCC())
    expect(patch().modulations).toHaveLength(1)
    expect(gear("Voice 1 · Pace")).toHaveAttribute("data-modulated", "true")
    expect(popover("Voice 1 · Pace").getByText("On step 5")).toBeInTheDocument()
  })
})

describe("a modulated setting while the sequence plays", () => {
  // Voice 1's pace, 4th to 16th on CC 3, which the first step holds at a
  // 4th; the voice's own pace is an 8th. A bar a step, at 120: two seconds.
  const PACE_BY_CC: ModulationJSON = {
    target: { kind: "voice", voice: 0, setting: "pace" },
    cc: 3,
    from: "4th",
    to: "16th",
  }
  const modulated = (each: PatchJSON): PatchJSON => {
    const next = addEnvelope({ ...each, modulations: [PACE_BY_CC] }, 0, {
      cc: 3,
      channel: 1,
      points: [{ time: 0, value: 0 }],
    })
    next.steps[0].notes = [60]
    next.steps[1].notes = [64]
    return next
  }
  const pace = () => voices().getByLabelText("Pace")
  const live = (control: HTMLElement) =>
    control.closest("[data-live]")?.getAttribute("data-live")
  const play = () => act(() => rootStore.player.play())
  const playFor = (ms: number) =>
    act(() => {
      const end = now + ms
      while (now < end) {
        now += 25
        ticker.tick()
      }
    })

  it("shows the value the sounding step's envelope has it at", () => {
    setup(modulated)
    expect(pace()).toHaveDisplayValue("8th")
    expect(live(pace())).toBe("false")

    play()
    playFor(100)
    expect(pace()).toHaveDisplayValue("4th")
    expect(live(pace())).toBe("true")

    // the second step leaves the setting its own
    playFor(2000)
    expect(pace()).toHaveDisplayValue("8th")
    expect(live(pace())).toBe("false")

    act(() => rootStore.player.stop())
    expect(pace()).toHaveDisplayValue("8th")
  })

  it("shows its own value, the one it changes, while it is pointed at or used", () => {
    setup(modulated)
    play()
    playFor(100)

    fireEvent.mouseEnter(pace())
    expect(pace()).toHaveDisplayValue("8th")
    expect(live(pace())).toBe("false")
    chooseIn(pace(), "16th")
    expect(patch().voices[0].pace).toBe("16th")
    fireEvent.mouseLeave(pace())
    expect(pace()).toHaveDisplayValue("4th")

    // focused, as from the keyboard, it is the setting's own again
    act(() => pace().focus())
    expect(pace()).toHaveDisplayValue("16th")
    act(() => pace().blur())
    expect(pace()).toHaveDisplayValue("4th")

    // its label, and its gear, leave it showing the step's
    fireEvent.mouseEnter(voices().getByText("Pace"))
    expect(pace()).toHaveDisplayValue("4th")
    fireEvent.click(gear("Voice 1 · Pace"))
    expect(pace()).toHaveDisplayValue("4th")
  })

  it("shows another voice's settings as they are, and follows the voice shown", () => {
    setup(modulated)
    play()
    playFor(100)
    fireEvent.click(screen.getByRole("button", { name: "Voice 2" }))
    expect(pace()).toHaveDisplayValue("8th")
    expect(live(pace())).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "Voice 1" }))
    expect(pace()).toHaveDisplayValue("4th")
  })
})

describe("modulating an action", () => {
  const grid = () => within(screen.getByRole("region", { name: "Grid" }))
  // the row's button: the title bar's icons are out of reach at the top
  const action = (name: string) => grid().getByRole("button", { name })
  const icons = () =>
    document.querySelector("[data-action-icons]") as HTMLElement

  it("offers a gear on each action's button under the grid, and none on the title bar's icons", () => {
    setup()
    for (const name of [
      "Actions · Hold",
      "Voice 1 · Sync",
      "Actions · Flip",
      "Actions · Transpose",
    ]) {
      expect(
        grid().getByRole("button", { name: `Modulation settings: ${name}` }),
      ).toBeInTheDocument()
    }
    expect(
      within(icons()).queryAllByRole("button", {
        name: /Modulation settings/,
        hidden: true,
      }),
    ).toEqual([])
  })

  it("turns an action on or off on the steps with its CC, starting off", () => {
    setup()
    fireEvent.click(gear("Actions · Flip"))
    const shown = popover("Actions · Flip")
    expect(shown.getByLabelText("Actions · Flip From")).toHaveDisplayValue(
      "Off",
    )
    expect(shown.getByLabelText("Actions · Flip To")).toHaveDisplayValue("On")
    expect(shown.getByText(/2 values/)).toBeInTheDocument()
    fireEvent.click(shown.getByRole("button", { name: "Modulate" }))

    expect(patch().modulations).toEqual([
      {
        target: { kind: "action", setting: "flip" },
        cc: 3,
        from: false,
        to: true,
      },
    ])
    // the step in the editor is given the envelope, off until drawn on
    expect(patch().steps[4].envelopes).toMatchObject([
      { cc: 3, points: [{ time: 0, value: 0 }] },
    ])
    expect(selectedTab()).toEqual(["Flip"])
    expect(axis()).toEqual(["Off", "On"])
    expect(gear("Actions · Flip")).toHaveAttribute("data-modulated", "true")
  })

  it("gives Sync to the voice selected, so each voice has its own", () => {
    setup()
    fireEvent.click(gear("Voice 1 · Sync"))
    fireEvent.click(
      popover("Voice 1 · Sync").getByRole("button", { name: "Modulate" }),
    )
    expect(patch().modulations[0].target).toEqual({
      kind: "action",
      setting: "sync",
      voice: 0,
    })
    expect(selectedTab()).toEqual(["Sync 1"])

    // Voice 2's is another, not yet modulated, on a CC of its own
    fireEvent.click(screen.getByRole("button", { name: "Voice 2" }))
    expect(gear("Voice 2 · Sync")).toHaveAttribute("data-modulated", "false")
    fireEvent.click(gear("Voice 2 · Sync"))
    expect(
      popover("Voice 2 · Sync").getByLabelText("Voice 2 · Sync CC"),
    ).toHaveValue("9")
  })

  describe("while the sequence plays", () => {
    // Hold on CC 3, which the first step has on
    const hung = (each: PatchJSON): PatchJSON => {
      const next = addEnvelope(
        {
          ...each,
          modulations: [
            {
              target: { kind: "action", setting: "hold" },
              cc: 3,
              from: false,
              to: true,
            },
          ],
        },
        0,
        { cc: 3, channel: 1, points: [{ time: 0, value: 127 }] },
      )
      next.steps[0].notes = [60]
      next.steps[1].notes = [64]
      return next
    }
    const live = (button: HTMLElement) => button.getAttribute("data-live")

    it("shows the action as the sounding step has it, and the button's own while pointed at", () => {
      setup(hung)
      const hold = action("Hold")
      expect(live(hold)).toBe("false")

      act(() => rootStore.player.play())
      act(() => {
        for (let tick = 0; tick < 4; tick++) {
          now += 25
          ticker.tick()
        }
      })
      expect(live(hold)).toBe("true")
      expect(hold.className).toContain("bg-envelope")
      // the title bar's icon shows it too
      expect(
        within(icons()).getByRole("button", { name: "Hold", hidden: true }),
      ).toHaveAttribute("data-live", "true")

      fireEvent.mouseEnter(hold)
      expect(live(hold)).toBe("false")
      expect(hold.className).not.toContain("bg-theme")
      fireEvent.mouseLeave(hold)
      expect(live(hold)).toBe("true")

      act(() => rootStore.player.stop())
      expect(live(hold)).toBe("false")
    })
  })
})

describe("the sequencer's scale", () => {
  it("offers the ten scales its modulation reaches at every tonic", () => {
    setup()
    const names = comboOptions(sequencer().getByLabelText("Scale"))
    expect(names.map((option) => option.textContent)).toEqual([
      "Chromatic",
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
    expect(from).toHaveDisplayValue("Chromatic")
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
