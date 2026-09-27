import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "./App"

const createStore = () =>
  new RootStore({ requestMIDIAccess: null, ticker: new ManualTicker() })

describe("App", () => {
  it("renders the sequencer editor layout", () => {
    render(<App rootStore={createStore()} />)

    expect(screen.getByRole("banner")).toBeInTheDocument()
    expect(screen.getByText("Sequencer")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Jump rule" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Grid" })).toBeInTheDocument()
    expect(screen.getByText("Voices")).toBeInTheDocument()
    for (const action of ["Hold", "Sync", "Flip", "Shift"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument()
    }
    // the large grid draws 64 steps
    expect(screen.getByRole("button", { name: "Step 64" })).toBeInTheDocument()
  })

  it("toggles play and stop", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(rootStore.player.isPlaying).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(rootStore.player.isPlaying).toBe(false)
  })

  it("records what is played on the chosen step", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    fireEvent.click(screen.getByRole("button", { name: "Step 3" }))

    act(() => {
      for (const note of [60, 64, 67, 71]) {
        rootStore.midiInput.handleMessage([0x90, note, 100])
        rootStore.midiInput.handleMessage([0x80, note, 0])
      }
    })

    expect(rootStore.sequencerStore.patch.steps[2].notes).toEqual([
      60, 64, 67, 71,
    ])
    // the step is full, so recording moves on to the next one
    expect(rootStore.recorder.target).toBe(3)
  })

  // Clear all went with the logo bar: File → New is how a patch is emptied.
  it("empties the steps and resets the voices with File → New", () => {
    const rootStore = createStore()
    // yes, the changes can go
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    render(<App rootStore={rootStore} />)
    const patch = () => rootStore.sequencerStore.patch

    // the demo patch starts with chords, jumps and three voices playing
    expect(patch().steps[0].notes.length).toBeGreaterThan(0)
    expect(patch().voices[1].enabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Tempo up" }))

    fireEvent.click(screen.getByRole("button", { name: "File" }))
    fireEvent.click(screen.getByRole("button", { name: "New" }))

    expect(patch().steps.every((step) => step.notes.length === 0)).toBe(true)
    expect(patch().steps.every((step) => step.jump.dest === null)).toBe(true)
    expect(patch().voices[0].rule).toBe("nth")
    expect(patch().voices[1].enabled).toBe(false)
    // unlike Clear all, New is a whole new patch: the tempo goes back too,
    // and its history starts fresh rather than one Undo from the old one
    expect(patch().tempo).toBe(120)
    expect(rootStore.history.canUndo).toBe(false)
    confirm.mockRestore()
  })

  it("asks for MIDI access when the app starts, and again on request", async () => {
    let attempts = 0
    const rootStore = new RootStore({
      ticker: new ManualTicker(),
      requestMIDIAccess: async () => {
        attempts++
        throw new Error("Permission denied")
      },
    })
    await act(async () => {
      rootStore.init()
    })
    expect(attempts).toBe(1)

    render(<App rootStore={rootStore} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "MIDI" }))
    expect(screen.getByText(/Permission denied/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    })
    expect(attempts).toBe(2)
  })

  it("closes a menu on a click elsewhere, or on Escape", () => {
    render(<App rootStore={createStore()} />)
    const file = screen.getByRole("button", { name: "File" })

    fireEvent.click(file)
    expect(screen.getByRole("menu", { name: "File" })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("menu", { name: "File" })).toBeNull()

    fireEvent.click(file)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("menu", { name: "File" })).toBeNull()
  })

  it("drags a typed-in number up and down, as one undo", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    const tempo = screen.getByRole("textbox", { name: "Tempo" })

    vi.useFakeTimers({ toFake: ["performance"] })
    try {
      // slowly, ten pixels a step
      fireEvent.mouseDown(tempo, { button: 0, clientY: 100 })
      vi.advanceTimersByTime(200)
      fireEvent.mouseMove(document, { clientY: 90 })
      vi.advanceTimersByTime(200)
      fireEvent.mouseMove(document, { clientY: 80 })
      fireEvent.mouseUp(document, { clientY: 80 })
      expect(rootStore.sequencerStore.patch.tempo).toBe(122)
      expect(document.activeElement).not.toBe(tempo)

      // quickly, far past the bottom
      fireEvent.mouseDown(tempo, { button: 0, clientY: 100 })
      vi.advanceTimersByTime(20)
      fireEvent.mouseMove(document, { clientY: 400 })
      fireEvent.mouseUp(document, { clientY: 400 })
      expect(rootStore.sequencerStore.patch.tempo).toBe(20)
    } finally {
      vi.useRealTimers()
    }

    rootStore.history.undo()
    expect(rootStore.sequencerStore.patch.tempo).toBe(122)
    rootStore.history.undo()
    expect(rootStore.sequencerStore.patch.tempo).toBe(120)
  })

  it("drags a number off its limit a few pixels at a time, the mouse hidden meanwhile", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    const pattern = screen.getByRole("textbox", { name: "Pattern" })
    const dragging = () => "midiseqDragging" in document.documentElement.dataset
    expect(rootStore.sequencerStore.patch.voices[0].patternLength).toBe(16)

    vi.useFakeTimers({ toFake: ["performance"] })
    try {
      fireEvent.mouseDown(pattern, { button: 0, clientY: 100 })
      // slowly down, two pixels a move, as a hand does
      for (let y = 102; y <= 124; y += 2) {
        vi.advanceTimersByTime(100)
        fireEvent.mouseMove(document, { clientY: y })
      }
      expect(dragging()).toBe(true)
      fireEvent.mouseUp(document, { clientY: 124 })
    } finally {
      vi.useRealTimers()
    }

    expect(rootStore.sequencerStore.patch.voices[0].patternLength).toBe(14)
    expect(dragging()).toBe(false)
  })

  it("types a plain number in, as a whole number", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    const shift = screen.getByRole("textbox", { name: "Shift amt" })

    const type = (text: string) => {
      fireEvent.focus(shift)
      fireEvent.change(shift, { target: { value: text } })
      fireEvent.keyDown(shift, { key: "Enter" })
    }
    type("-7")
    expect(rootStore.sequencerStore.patch.shiftAmt).toBe(-7)
    type("6.6")
    expect(rootStore.sequencerStore.patch.shiftAmt).toBe(7)
    // within its limits
    type("30")
    expect(rootStore.sequencerStore.patch.shiftAmt).toBe(24)
  })

  it("focuses a typed-in number on a press that doesn't move", () => {
    render(<App rootStore={createStore()} />)
    const tempo = screen.getByRole("textbox", { name: "Tempo" })

    fireEvent.mouseDown(tempo, { button: 0, clientY: 100 })
    fireEvent.mouseUp(document, { clientY: 100 })
    expect(document.activeElement).toBe(tempo)
  })

  it("explains when Web MIDI is unavailable", () => {
    render(<App rootStore={createStore()} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "MIDI" }))
    expect(
      screen.getByText(/This browser doesn't support Web MIDI/),
    ).toBeInTheDocument()
  })
})
