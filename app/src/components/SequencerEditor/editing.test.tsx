import { createDefaultPatch } from "@midiseq/core"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch
const sequencerPanel = () =>
  within(screen.getByRole("region", { name: "Sequencer" }))
const voicePanel = () => within(screen.getByRole("region", { name: "Voices" }))
const selectVoice = (number: number) =>
  fireEvent.click(screen.getByRole("button", { name: `Voice ${number}` }))

beforeEach(() => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
  })
  // a plain patch, so the starting values are predictable
  rootStore.sequencerStore.patch = createDefaultPatch()
  render(<App rootStore={rootStore} />)
  // the voice tab is view state and lives on past a render
  selectVoice(1)
})

describe("editing the sequencer", () => {
  it("changes a sequencer setting", () => {
    fireEvent.change(sequencerPanel().getByLabelText("Direction"), {
      target: { value: "random+" },
    })
    expect(patch().direction).toBe("random+")

    fireEvent.change(sequencerPanel().getByLabelText("Pace"), {
      target: { value: "16th" },
    })
    expect(patch().pace).toBe("16th")
  })

  it("shows the loop end only for a custom loop", () => {
    expect(sequencerPanel().queryByText("Loop end")).toBeNull()

    fireEvent.change(sequencerPanel().getByLabelText("Loop"), {
      target: { value: "custom" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Loop end up" }))
    expect(patch().loop).toEqual({ mode: "custom", end: 16 })
  })

  it("edits the selected voice", () => {
    selectVoice(2)
    fireEvent.click(voicePanel().getByRole("switch", { name: "Enable" }))
    expect(patch().voices[1].enabled).toBe(true)

    fireEvent.change(voicePanel().getByLabelText("Rule"), {
      target: { value: "downup" },
    })
    expect(patch().voices[1].rule).toBe("downup")
    // voice 1 is untouched
    expect(patch().voices[0].rule).toBe("nth")
  })

  it("toggles a pattern dot", () => {
    const dot = voicePanel().getByRole("button", { name: "Voice 1 Dot 3" })

    fireEvent.click(dot)
    expect(patch().voices[0].pattern[2].on).toBe(false)
    fireEvent.click(dot)
    expect(patch().voices[0].pattern[2].on).toBe(true)
  })

  describe("voice colours and the pattern rows", () => {
    const row = (voice: number) =>
      screen.getByRole("group", { name: `Voice ${voice} pattern` })
    const dot = (voice: number, number: number) =>
      screen.getByRole("button", { name: `Voice ${voice} Dot ${number}` })
    const colourOf = (element: HTMLElement) =>
      element.style.getPropertyValue("--midiseq-voice")
    // the dot numbers the band wraps, in pattern order
    const reached = (voice: number) =>
      within(row(voice))
        .getAllByRole("button", { name: /Dot/ })
        .flatMap((button, index) =>
          button.getAttribute("data-reached") === "true" ? [index + 1] : [],
        )
    const setPace = (value: string, panel = sequencerPanel()) =>
      fireEvent.change(panel.getByLabelText("Pace"), { target: { value } })

    it("gives every tab and pattern row its own voice's colour", () => {
      for (const voice of [1, 2, 3, 4]) {
        const expected = `var(--midiseq-voice-${voice - 1})`
        const tab = screen.getByRole("button", { name: `Voice ${voice}` })
        expect(colourOf(tab)).toBe(expected)
        expect(colourOf(row(voice))).toBe(expected)
      }
    })

    it("underlines the active tab in its voice's colour, not the theme's", () => {
      selectVoice(3)
      const tab = screen.getByRole("button", { name: "Voice 3" })
      expect(tab).toHaveClass("border-voice")
      expect(tab).not.toHaveClass("border-theme")
      expect(screen.getByRole("button", { name: "Voice 1" })).toHaveClass(
        "border-transparent",
      )
    })

    it("shows every voice's pattern as its own row of 16 dots", () => {
      for (const voice of [1, 2, 3, 4]) {
        expect(
          within(row(voice)).getAllByRole("button", { name: /Dot/ }),
        ).toHaveLength(16)
      }
      expect(row(1)).toHaveAttribute("aria-current", "true")
      expect(row(2)).toHaveAttribute("aria-current", "false")
    })

    it("edits any voice's dot, and selects that voice", () => {
      fireEvent.click(dot(3, 4))
      expect(patch().voices[2].pattern[3].on).toBe(false)
      // the other voices are untouched
      expect(patch().voices[0].pattern[3].on).toBe(true)
      expect(screen.getByRole("button", { name: "Voice 3" })).toHaveAttribute(
        "data-active",
        "true",
      )
      expect(row(3)).toHaveAttribute("aria-current", "true")
    })

    it("selects a voice from its row's number, leaving its dots alone", () => {
      const before = patch()
      fireEvent.click(screen.getByRole("button", { name: "Select voice 3" }))

      expect(patch()).toBe(before)
      expect(screen.getByRole("button", { name: "Voice 3" })).toHaveAttribute(
        "data-active",
        "true",
      )
      expect(row(3)).toHaveAttribute("aria-current", "true")
      expect(
        screen.getByRole("button", { name: "Select voice 3" }),
      ).toHaveAttribute("aria-pressed", "true")
      expect(
        screen.getByRole("button", { name: "Select voice 1" }),
      ).toHaveAttribute("aria-pressed", "false")
    })

    it("opens a dot's options for its own voice", () => {
      fireEvent.contextMenu(dot(2, 5))
      const options = within(
        screen.getByRole("dialog", { name: "Voice 2 Dot 5" }),
      )
      fireEvent.change(options.getByLabelText("Ratchet"), {
        target: { value: "2" },
      })
      expect(patch().voices[1].pattern[4].ratchet).toBe(2)
      expect(patch().voices[0].pattern[4].ratchet).toBe(1)
      expect(dot(2, 5)).toHaveAttribute("data-editing", "true")
      expect(dot(1, 5)).toHaveAttribute("data-editing", "false")
      // opening a dot's options selects its voice too
      expect(screen.getByRole("button", { name: "Voice 2" })).toHaveAttribute(
        "data-active",
        "true",
      )
    })

    it("highlights the dots a voice reaches in one sequencer step", () => {
      // the default patch: sequencer and voices both at 8ths, a dot a step
      expect(reached(1)).toEqual([1])

      // a bar-long step gives an 8th-note voice eight dots
      setPace("1bar")
      expect(reached(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(row(1)).toHaveAttribute("data-reach", "8")

      // and a faster voice more, on its row only
      selectVoice(2)
      setPace("16th", voicePanel())
      expect(reached(2)).toHaveLength(16)
      expect(reached(1)).toHaveLength(8)
    })

    it("moves the band to where each voice is on the sounding step", () => {
      setPace("4th")
      // 8th-note voices reach two dots a step
      act(() => {
        rootStore.player.voiceDots = [4, 15, 0, 9]
      })
      expect(reached(1)).toEqual([5, 6])
      expect(reached(3)).toEqual([1, 2])
      expect(reached(4)).toEqual([10, 11])
    })

    it("wraps the band past the end of the pattern, as the voice does", () => {
      setPace("4th")
      act(() => {
        rootStore.player.voiceDots = [0, 15, 0, 0]
      })
      expect(reached(2)).toEqual([1, 16])
      expect(row(2).querySelectorAll("[data-band]").length).toBe(2)
    })

    it("underlines the dot each voice is playing", () => {
      const playing = () =>
        [1, 2, 3, 4].map((voice) =>
          within(row(voice))
            .getAllByRole("button", { name: /Dot/ })
            .findIndex((button) => button.dataset.playing === "true"),
        )
      expect(playing()).toEqual([-1, -1, -1, -1])
      expect(document.querySelector("[data-playhead]")).toBeNull()

      act(() => {
        rootStore.player.playingDots = [3, null, 15, 0]
      })
      // a voice that has not reached a dot yet shows none
      expect(playing()).toEqual([3, -1, 15, 0])
      expect(dot(1, 4).querySelector("[data-playhead]")).not.toBeNull()
      expect(document.querySelectorAll("[data-playhead]")).toHaveLength(3)

      act(() => {
        rootStore.player.playingDots = null
      })
      expect(document.querySelector("[data-playhead]")).toBeNull()
    })

    it("returns the band to the first dot once playing stops", () => {
      setPace("4th")
      act(() => {
        rootStore.player.voiceDots = [6, 6, 6, 6]
      })
      act(() => {
        rootStore.player.voiceDots = null
      })
      expect(reached(1)).toEqual([1, 2])
    })

    it("marks the selected voice's row with an arrow in place of its number", () => {
      expect(row(1).querySelector("svg")).not.toBeNull()
      expect(within(row(1)).queryByText("1")).toBeNull()
      expect(within(row(2)).getByText("2")).toBeInTheDocument()

      selectVoice(2)
      expect(row(2).querySelector("svg")).not.toBeNull()
      expect(within(row(1)).getByText("1")).toBeInTheDocument()
    })

    it("keeps the highlight inside the pattern's length", () => {
      setPace("1bar")
      selectVoice(4)
      for (let i = 0; i < 11; i++) {
        fireEvent.click(
          voicePanel().getByRole("button", { name: "Pattern down" }),
        )
      }
      expect(patch().voices[3].patternLength).toBe(5)
      expect(reached(4)).toEqual([1, 2, 3, 4, 5])
      expect(dot(4, 6)).toHaveAttribute("data-beyond", "true")
    })
  })

  it("steps the tempo", () => {
    fireEvent.click(screen.getByRole("button", { name: "Tempo up" }))
    expect(patch().tempo).toBe(121)
  })

  describe("typing the tempo", () => {
    const tempoField = () =>
      screen.getByRole("textbox", { name: "Tempo" }) as HTMLInputElement

    it("shows the units until it is focused", () => {
      expect(tempoField().value).toBe("120 BPM")

      fireEvent.focus(tempoField())
      expect(tempoField().value).toBe("120")
    })

    it("takes a typed tempo on Enter", () => {
      fireEvent.focus(tempoField())
      fireEvent.change(tempoField(), { target: { value: "96" } })
      fireEvent.keyDown(tempoField(), { key: "Enter" })

      expect(patch().tempo).toBe(96)
      expect(tempoField().value).toBe("96 BPM")
    })

    it("takes one on blur, and reads past the units", () => {
      fireEvent.focus(tempoField())
      fireEvent.change(tempoField(), { target: { value: "88 BPM" } })
      fireEvent.blur(tempoField())
      expect(patch().tempo).toBe(88)
    })

    it("keeps the tempo inside its range and ignores nonsense", () => {
      fireEvent.focus(tempoField())
      fireEvent.change(tempoField(), { target: { value: "900" } })
      fireEvent.blur(tempoField())
      expect(patch().tempo).toBe(400)

      fireEvent.focus(tempoField())
      fireEvent.change(tempoField(), { target: { value: "fast" } })
      fireEvent.blur(tempoField())
      expect(patch().tempo).toBe(400)
    })

    it("drops the edit on Escape", () => {
      fireEvent.focus(tempoField())
      fireEvent.change(tempoField(), { target: { value: "60" } })
      fireEvent.keyDown(tempoField(), { key: "Escape" })

      expect(patch().tempo).toBe(120)
      expect(tempoField().value).toBe("120 BPM")
    })
  })
})

describe("undo and redo", () => {
  const undoButton = () => editItem("Undo")
  const redoButton = () => editItem("Redo")

  it("walks an edit back and forward again", () => {
    expect(undoButton()).toBeDisabled()

    fireEvent.change(sequencerPanel().getByLabelText("Direction"), {
      target: { value: "bwd" },
    })
    expect(undoButton()).toBeEnabled()

    fireEvent.click(undoButton())
    expect(patch().direction).toBe("fwd")

    fireEvent.click(redoButton())
    expect(patch().direction).toBe("bwd")
  })

  it("answers the keyboard", () => {
    fireEvent.change(sequencerPanel().getByLabelText("Direction"), {
      target: { value: "bwd" },
    })
    fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true })
    expect(patch().direction).toBe("fwd")

    fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true, shiftKey: true })
    expect(patch().direction).toBe("bwd")
  })

  it("counts a recording take as one entry", () => {
    const before = patch()

    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    for (const note of [60, 62, 64]) {
      rootStore.midiInput.handleMessage([0x90, note, 100])
      rootStore.midiInput.handleMessage([0x80, note, 0])
    }
    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    // three of the four the step holds, so they stay together on it
    expect(
      patch()
        .steps.slice(0, 2)
        .map((step) => step.notes),
    ).toEqual([[60, 62, 64], []])

    fireEvent.click(undoButton())
    expect(patch()).toBe(before)
  })

  it("leaves the voice tab alone, since it is view state", () => {
    selectVoice(3)
    fireEvent.change(voicePanel().getByLabelText("Rule"), {
      target: { value: "rise" },
    })
    fireEvent.click(undoButton())

    expect(patch().voices[2].rule).toBe("nth")
    expect(screen.getByRole("button", { name: "Voice 3" })).toHaveAttribute(
      "data-active",
      "true",
    )
  })
})
