import { createDefaultPatch } from "@midiseq/core"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const enabled = () =>
  rootStore.sequencerStore.patch.voices.map((voice) => voice.enabled)
const button = (name: "Mute" | "Solo", voice: number) =>
  screen.getByRole("button", { name: `${name} Voice ${voice}` })
const pressed = (name: "Mute" | "Solo") =>
  [1, 2, 3, 4].map(
    (voice) => button(name, voice).getAttribute("aria-pressed") === "true",
  )
const click = (name: "Mute" | "Solo", voice: number) =>
  fireEvent.click(button(name, voice))
// the Enable switch above, for the voice whose tab is open
const enableSwitch = () => screen.getByRole("switch", { name: "Enable" })

// voices 1 to 3 on, 4 off
beforeEach(() => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  const patch = createDefaultPatch()
  patch.voices[1].enabled = true
  patch.voices[2].enabled = true
  rootStore.sequencerStore.patch = patch
  render(<App rootStore={rootStore} />)
})

describe("mute", () => {
  it("is the voice's Enable, switched off", () => {
    expect(pressed("Mute")).toEqual([false, false, false, true])
    click("Mute", 2)
    expect(enabled()).toEqual([true, false, true, false])
    click("Mute", 4)
    expect(enabled()).toEqual([true, false, true, true])
    expect(pressed("Mute")).toEqual([false, true, false, false])
  })

  it("shows on the Enable switch, and follows it", () => {
    click("Mute", 1)
    expect(enableSwitch()).not.toBeChecked()
    fireEvent.click(enableSwitch())
    expect(pressed("Mute")[0]).toBe(false)
  })
})

describe("solo", () => {
  it("switches every other voice off", () => {
    click("Solo", 2)
    expect(enabled()).toEqual([false, true, false, false])
    expect(pressed("Solo")).toEqual([false, true, false, false])
    expect(pressed("Mute")).toEqual([true, false, true, true])
  })

  it("switches back on what was on before, when pressed again", () => {
    click("Solo", 2)
    click("Solo", 2)
    expect(enabled()).toEqual([true, true, true, false])
    expect(pressed("Solo")).toEqual([false, false, false, false])
  })

  it("brings back what was on before the first, moved from voice to voice", () => {
    click("Solo", 2)
    click("Solo", 4)
    expect(enabled()).toEqual([false, false, false, true])
    click("Solo", 4)
    expect(enabled()).toEqual([true, true, true, true])
  })

  it("shows on a voice left on alone by hand, and un-soloing that turns them all on", () => {
    click("Mute", 2)
    click("Mute", 3)
    expect(pressed("Solo")).toEqual([true, false, false, false])
    click("Solo", 1)
    expect(enabled()).toEqual([true, true, true, true])
  })

  it("lets go once another voice is switched on", () => {
    click("Solo", 2)
    click("Mute", 3)
    expect(pressed("Solo")).toEqual([false, false, false, false])
  })

  it("undoes in one go", () => {
    click("Solo", 2)
    act(() => rootStore.history.undo())
    expect(enabled()).toEqual([true, true, true, false])
  })
})
