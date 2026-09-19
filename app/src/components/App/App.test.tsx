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
    expect(screen.getByText("Jumps")).toBeInTheDocument()
    expect(screen.getByText("Sequence Grid")).toBeInTheDocument()
    expect(screen.getByText("Voices")).toBeInTheDocument()
    for (const action of ["Hang", "Bump", "Flip", "Shift"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument()
    }
  })

  it("shows the patch name from the sequencer store", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    expect(screen.getByText("Demo")).toBeInTheDocument()

    act(() => {
      rootStore.sequencerStore.patch = {
        ...rootStore.sequencerStore.patch,
        name: "Bassline",
      }
    })
    expect(screen.getByText("Bassline")).toBeInTheDocument()
  })

  it("toggles play and stop", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(rootStore.player.isPlaying).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(rootStore.player.isPlaying).toBe(false)
  })

  it("offers to retry when MIDI access is refused", async () => {
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
    render(<App rootStore={rootStore} />)

    fireEvent.click(screen.getByRole("button", { name: "MIDI Outputs" }))
    expect(screen.getByText(/Permission denied/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    })
    expect(attempts).toBe(2)
  })

  it("explains when Web MIDI is unavailable", () => {
    render(<App rootStore={createStore()} />)
    fireEvent.click(screen.getByRole("button", { name: "MIDI Outputs" }))
    expect(
      screen.getByText(/This browser doesn't support Web MIDI/),
    ).toBeInTheDocument()
  })
})
