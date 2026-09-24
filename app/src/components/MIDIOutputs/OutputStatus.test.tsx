import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

const createStore = () =>
  new RootStore({ requestMIDIAccess: null, ticker: new ManualTicker() })

const status = () => screen.queryByRole("status")

describe("OutputStatus", () => {
  it("says why nothing can be heard until an output is chosen", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    expect(status()).toHaveTextContent(/pick an output in MIDI/)

    act(() => {
      rootStore.midiDeviceStore.toggleOutput("loopMIDI Port", true)
    })
    expect(status()).toBeNull()
  })

  it("counts a single voice as an output of its own", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    act(() => {
      rootStore.midiDeviceStore.setVoiceOutput(2, "loopMIDI Port")
    })
    expect(status()).toBeNull()
  })

  it("shows the built-in sound starting, then what went wrong", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    act(() => {
      rootStore.synthStore.state = "loading"
    })
    expect(status()).toHaveTextContent(/Starting the built-in sound/)

    act(() => {
      rootStore.synthStore.state = "error"
      rootStore.synthStore.error = "Couldn't fetch the SoundFont (503)"
    })
    expect(status()).toHaveTextContent(/SoundFont \(503\)/)
  })

  it("says why recording hears nothing until an input is ticked", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)
    const text = () => status()?.textContent ?? ""

    // nothing about inputs until recording is armed
    expect(text()).not.toMatch(/record from/)

    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    expect(text()).toMatch(/tick a MIDI input in Settings/)

    act(() => {
      rootStore.midiDeviceStore.toggleInput("Keystation", true)
    })
    expect(text()).not.toMatch(/record from/)
  })
})
