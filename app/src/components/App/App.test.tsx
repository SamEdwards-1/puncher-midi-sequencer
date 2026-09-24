import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
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
    expect(screen.getByText("Sequence Grid")).toBeInTheDocument()
    expect(screen.getByText("Voices")).toBeInTheDocument()
    for (const action of ["Hang", "Bump", "Flip", "Shift"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument()
    }
    // the large grid draws 64 steps
    expect(screen.getByRole("button", { name: "Step 64" })).toBeInTheDocument()
  })

  it("shows the patch name from the sequencer store", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    expect(screen.getByText(/Demo/)).toBeInTheDocument()

    act(() => {
      rootStore.sequencerStore.patch = {
        ...rootStore.sequencerStore.patch,
        name: "Bassline",
      }
    })
    expect(screen.getByText(/Bassline/)).toBeInTheDocument()
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

  it("clears the steps and the voices, in one undo", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    const patch = () => rootStore.sequencerStore.patch
    const before = patch()

    // the demo patch starts with chords, jumps and three voices playing
    expect(before.steps[0].notes.length).toBeGreaterThan(0)
    expect(before.voices[1].enabled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))

    expect(patch().steps.every((step) => step.notes.length === 0)).toBe(true)
    expect(patch().steps.every((step) => step.jump.dest === null)).toBe(true)
    expect(patch().voices[0].rule).toBe("nth")
    expect(patch().voices[1].enabled).toBe(false)
    // the tempo and the rest of the sequencer are left alone
    expect(patch().tempo).toBe(before.tempo)
    expect(patch().pace).toBe(before.pace)

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(patch()).toBe(before)
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
    expect(screen.getByText(/Permission denied/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    })
    expect(attempts).toBe(2)
  })

  it("explains when Web MIDI is unavailable", () => {
    render(<App rootStore={createStore()} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(
      screen.getByText(/This browser doesn't support Web MIDI/),
    ).toBeInTheDocument()
  })
})
