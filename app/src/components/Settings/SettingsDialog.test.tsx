import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

type FakePort = {
  id: string
  name: string
  state: string
  send: () => void
  clear: () => void
  onmidimessage: ((event: { data: Uint8Array }) => void) | null
}

const fakePort = (id: string, name: string): FakePort => ({
  id,
  name,
  state: "connected",
  send: () => {},
  clear: () => {},
  onmidimessage: null,
})

const keyboard = fakePort("k", "Keystation")
const drums = fakePort("d", "Drum pad")
const loop = fakePort("o", "midiseq out")

const access = {
  inputs: new Map([
    ["k", keyboard],
    ["d", drums],
  ]),
  outputs: new Map([["o", loop]]),
  onstatechange: null,
}

const memoryStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

describe("the settings dialog", () => {
  let rootStore: RootStore

  const open = async () => {
    rootStore = new RootStore({
      ticker: new ManualTicker(),
      storage: memoryStorage(),
      requestMIDIAccess: async () => access as unknown as MIDIAccess,
    })
    await act(async () => {
      await rootStore.midiDeviceStore.requestMIDIAccess()
    })
    render(<App rootStore={rootStore} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    return within(screen.getByRole("dialog", { name: "Settings" }))
  }

  const midi = () => rootStore.midiDeviceStore

  it("lists the ports as ticks, and opens the ones that are ticked", async () => {
    const dialog = await open()

    expect(dialog.getByText("Inputs")).toBeInTheDocument()
    expect(dialog.getByText("Outputs")).toBeInTheDocument()

    fireEvent.click(dialog.getByRole("checkbox", { name: "Keystation" }))
    fireEvent.click(dialog.getByRole("checkbox", { name: "Drum pad" }))
    expect(midi().inputNames).toEqual(["Keystation", "Drum pad"])
    expect(midi().inputPorts).toHaveLength(2)

    // both ports reach the recorder
    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    act(() => {
      keyboard.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) })
      drums.onmidimessage?.({ data: new Uint8Array([0x90, 64, 100]) })
    })
    expect(rootStore.sequencerStore.patch.steps[0].notes).toEqual([60, 64])

    fireEvent.click(dialog.getByRole("checkbox", { name: "Keystation" }))
    expect(midi().inputNames).toEqual(["Drum pad"])
  })

  it("sends the whole sequence to every ticked output", async () => {
    const dialog = await open()

    fireEvent.click(dialog.getByRole("checkbox", { name: "midiseq out" }))
    fireEvent.click(dialog.getByRole("checkbox", { name: "Built-in synth" }))
    expect(midi().outputNames.all).toEqual(["midiseq out", "Built-in synth"])

    fireEvent.click(dialog.getByRole("checkbox", { name: "midiseq out" }))
    expect(midi().outputNames.all).toEqual(["Built-in synth"])
  })

  it("keeps a port of its own for a voice", async () => {
    const dialog = await open()

    fireEvent.change(dialog.getByLabelText(/Voice 2/), {
      target: { value: "midiseq out" },
    })
    expect(midi().outputNames.voices[1]).toBe("midiseq out")
  })

  it("filters the channels the inputs may use", async () => {
    const dialog = await open()
    fireEvent.click(dialog.getByRole("checkbox", { name: "Keystation" }))

    fireEvent.click(dialog.getByRole("button", { name: "None" }))
    expect(midi().filter.channels).toEqual([])

    fireEvent.click(dialog.getByRole("button", { name: "Channel 3" }))
    expect(midi().filter.channels).toEqual([3])

    // what arrives on another channel is not recorded, so the step it would
    // have landed on is left as the demo patch had it
    const before = rootStore.sequencerStore.patch.steps[0].notes
    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    act(() => {
      keyboard.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) })
    })
    expect(rootStore.sequencerStore.patch.steps[0].notes).toEqual(before)

    act(() => {
      keyboard.onmidimessage?.({ data: new Uint8Array([0x92, 64, 100]) })
    })
    expect(rootStore.sequencerStore.patch.steps[0].notes).toEqual([64])
  })

  it("transposes and limits what comes in", async () => {
    const dialog = await open()
    fireEvent.click(dialog.getByRole("checkbox", { name: "Keystation" }))

    const type = (label: string, text: string) => {
      const field = dialog.getByLabelText(label)
      fireEvent.focus(field)
      fireEvent.change(field, { target: { value: text } })
      fireEvent.keyDown(field, { key: "Enter" })
    }
    type("Lowest note", "C4")
    type("Transpose", "12")
    expect(midi().filter).toMatchObject({ noteLow: 60, transpose: 12 })

    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    act(() => {
      // below the range, so it never arrives
      keyboard.onmidimessage?.({ data: new Uint8Array([0x90, 48, 100]) })
      // and this one comes in an octave up
      keyboard.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) })
    })
    expect(rootStore.sequencerStore.patch.steps[0].notes).toEqual([72])
  })

  it("opens the CC filter on a list of every controller", async () => {
    const dialog = await open()

    expect(dialog.queryByRole("checkbox", { name: /Modulation Wheel/ })).toBe(
      null,
    )
    fireEvent.click(dialog.getByRole("button", { name: /CC filter/ }))

    expect(
      dialog.getByRole("checkbox", { name: "1 Modulation Wheel (MSB)" }),
    ).toBeChecked()
    expect(
      dialog.getByRole("checkbox", { name: "123 All Notes Off" }),
    ).toBeInTheDocument()

    fireEvent.click(
      dialog.getByRole("checkbox", { name: "1 Modulation Wheel (MSB)" }),
    )
    expect(midi().filter.ccs).not.toContain(1)
    expect(midi().filter.ccs).toContain(2)
  })

  it("closes on Escape", async () => {
    await open()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull()
  })
})
