import { createDefaultPatch } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
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
    const dot = voicePanel().getByRole("button", { name: "Dot 3" })

    fireEvent.click(dot)
    expect(patch().voices[0].pattern[2].on).toBe(false)
    fireEvent.click(dot)
    expect(patch().voices[0].pattern[2].on).toBe(true)
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
  const undoButton = () => screen.getByRole("button", { name: "Undo" })
  const redoButton = () => screen.getByRole("button", { name: "Redo" })

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
