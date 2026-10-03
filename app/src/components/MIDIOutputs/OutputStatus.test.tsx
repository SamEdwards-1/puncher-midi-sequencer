import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { opened } from "../../test/dialogs"
import { ManualTicker, noOutputsChosen } from "../../test/fakes"
import { App } from "../App/App"

// a browser with Web MIDI, still deciding whether to hand it over
const createStore = ({ midi = true } = {}) =>
  new RootStore({
    requestMIDIAccess: midi ? () => new Promise<MIDIAccess>(() => {}) : null,
    ticker: new ManualTicker(),
    storage: noOutputsChosen(),
  })

const status = () => screen.queryByRole("status")

describe("OutputStatus", () => {
  it("says why nothing can be heard until an output is chosen", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    expect(status()).toHaveTextContent(/Pick an output in MIDI settings/)

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
    expect(text()).toMatch(/Tick a MIDI input in Settings/)

    act(() => {
      rootStore.midiDeviceStore.toggleInput("Keystation", true)
    })
    expect(text()).not.toMatch(/record from/)
  })

  it("stays dismissed until something else is wrong", () => {
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    act(() => {
      rootStore.synthStore.state = "loading"
    })
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(status()).toBeNull()

    act(() => {
      rootStore.synthStore.state = "error"
      rootStore.synthStore.error = "Couldn't fetch the SoundFont (503)"
    })
    expect(status()).toHaveTextContent(/SoundFont \(503\)/)
  })

  it("opens the MIDI settings from the nothing-routed warning", async () => {
    // the routing the tests above chose is saved
    localStorage.clear()
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(await opened("Settings")).toBeVisible()
    expect(rootStore.settingsTab.tab).toBe("midi")
  })

  it("says when the browser has no Web MIDI, until dismissed", () => {
    const rootStore = createStore({ midi: false })
    render(<App rootStore={rootStore} />)

    expect(status()).toHaveTextContent(/doesn't support Web MIDI/)
    expect(
      screen.getByRole("link", { name: "Supported browsers" }),
    ).toHaveAttribute("href", expect.stringContaining("#browser-support"))

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(status()).not.toHaveTextContent(/Web MIDI/)

    // the browser is no different for pressing play
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(status()).not.toHaveTextContent(/Web MIDI/)
  })

  it("comes back when play is pressed with still nothing routed", () => {
    localStorage.clear()
    const rootStore = createStore()
    render(<App rootStore={rootStore} />)

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(status()).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(status()).toHaveTextContent(/Nothing is routed/)
  })
})
