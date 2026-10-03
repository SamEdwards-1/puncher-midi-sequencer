import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import fr from "../../localize/fr"
import ja from "../../localize/ja"
import RootStore from "../../stores/RootStore"
import { opened } from "../../test/dialogs"
import { ManualTicker } from "../../test/fakes"
import { generatedThemes } from "../../theme/Theme"
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
  let storage: Storage
  let now = 1000

  const open = async () => {
    now = 1000
    storage = memoryStorage()
    // routed only as each test ticks, rather than to the first run's synth
    storage.setItem(
      "midiseq.midiOutputs",
      JSON.stringify({ all: [], voices: [null, null, null, null] }),
    )
    rootStore = new RootStore({
      ticker: new ManualTicker(),
      storage,
      now: () => now,
      requestMIDIAccess: async () => access as unknown as MIDIAccess,
    })
    await act(async () => {
      await rootStore.midiDeviceStore.requestMIDIAccess()
    })
    render(<App rootStore={rootStore} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    return within(await opened("Settings"))
  }

  // most of these are about MIDI, a tab away from where the dialog opens
  const openMIDI = async () => {
    const dialog = await open()
    fireEvent.click(dialog.getByRole("button", { name: "MIDI" }))
    return dialog
  }

  const midi = () => rootStore.midiDeviceStore

  it("lists the ports as ticks, and opens the ones that are ticked", async () => {
    const dialog = await openMIDI()

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
    const dialog = await openMIDI()

    fireEvent.click(dialog.getByRole("checkbox", { name: "midiseq out" }))
    fireEvent.click(dialog.getByRole("checkbox", { name: "Built-in synth" }))
    expect(midi().outputNames.all).toEqual(["midiseq out", "Built-in synth"])

    fireEvent.click(dialog.getByRole("checkbox", { name: "midiseq out" }))
    expect(midi().outputNames.all).toEqual(["Built-in synth"])
  })

  it("sends the CCs that drive settings unless told not to, and remembers", async () => {
    const dialog = await openMIDI()
    const send = dialog.getByRole("checkbox", { name: "Send modulation CCs" })
    expect(send).toBeChecked()

    fireEvent.click(send)
    expect(midi().sendModulationCCs).toBe(false)
    expect(storage.getItem("midiseq.midiModulationCCs")).toBe("false")
  })

  it("lets a voice's instrument be changed only while the built-in synth plays it", async () => {
    const dialog = await openMIDI()
    const instrument = () =>
      within(screen.getByRole("region", { name: "Voices" })).getByLabelText(
        "Instrument",
      )
    expect(instrument()).toBeDisabled()

    fireEvent.click(dialog.getByRole("checkbox", { name: "Built-in synth" }))
    expect(instrument()).toBeEnabled()
    fireEvent.click(dialog.getByRole("checkbox", { name: "Built-in synth" }))
    expect(instrument()).toBeDisabled()

    // the selected voice, the first, given the synth for its own
    fireEvent.change(dialog.getByLabelText(/Voice 1/), {
      target: { value: "Built-in synth" },
    })
    expect(instrument()).toBeEnabled()
  })

  it("mutes the built-in synth from beside a voice's instrument", async () => {
    const dialog = await openMIDI()
    const synth = dialog.getByRole("checkbox", { name: "Built-in synth" })
    fireEvent.click(synth)
    const mute = () =>
      within(screen.getByRole("region", { name: "Voices" })).getByRole(
        "button",
        { name: "Mute the built-in synth" },
      )
    expect(mute()).toHaveAttribute("aria-pressed", "false")

    // unticked as the dialog would, and still there to unmute it
    fireEvent.click(mute())
    expect(midi().outputNames.all).toEqual([])
    expect(synth).not.toBeChecked()
    expect(mute()).toHaveAttribute("aria-pressed", "true")
    expect(mute()).toHaveAttribute(
      "title",
      "Toggle built-in synth MIDI output setting",
    )
    // with nothing to play it, the instrument can't be changed
    const instrument = () =>
      within(screen.getByRole("region", { name: "Voices" })).getByLabelText(
        "Instrument",
      )
    expect(instrument()).toBeDisabled()

    fireEvent.click(mute())
    expect(midi().outputNames.all).toEqual(["Built-in synth"])
    expect(synth).toBeChecked()
    expect(instrument()).toBeEnabled()
  })

  it("keeps a port of its own for a voice", async () => {
    const dialog = await openMIDI()

    fireEvent.change(dialog.getByLabelText(/Voice 2/), {
      target: { value: "midiseq out" },
    })
    expect(midi().outputNames.voices[1]).toBe("midiseq out")
  })

  it("filters the channels the inputs may use", async () => {
    const dialog = await openMIDI()
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
    const dialog = await openMIDI()
    fireEvent.click(dialog.getByRole("checkbox", { name: "Keystation" }))

    const type = (label: string, text: string) => {
      const field = dialog.getByLabelText(label)
      fireEvent.focus(field)
      fireEvent.change(field, { target: { value: text } })
      fireEvent.keyDown(field, { key: "Enter" })
    }
    // the range reads from one note to the other
    expect(dialog.getByText("to")).toBeInTheDocument()
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
    const dialog = await openMIDI()

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

  it("takes a tempo from an incoming clock, and nothing else", async () => {
    const dialog = await openMIDI()
    fireEvent.click(dialog.getByRole("checkbox", { name: "Keystation" }))
    fireEvent.click(
      dialog.getByRole("checkbox", { name: "Take tempo from MIDI clock" }),
    )

    const before = rootStore.sequencerStore.patch.tempo
    expect(before).toBe(120)

    // 24 ticks a beat at 10 ms is 250 BPM, which the field's range caps at 400
    const clockAt = (bpm: number, ticks: number) => {
      const step = 60000 / (bpm * 24)
      act(() => {
        for (let i = 0; i < ticks; i++) {
          now += step
          keyboard.onmidimessage?.({ data: new Uint8Array([0xf8]) })
        }
      })
    }
    clockAt(90, 24)
    expect(rootStore.sequencerStore.patch.tempo).toBe(90)

    // the transport is still ours: a start byte does not set it playing
    act(() => {
      keyboard.onmidimessage?.({ data: new Uint8Array([0xfa]) })
    })
    expect(rootStore.player.isPlaying).toBe(false)

    // and with the box unticked the tempo stops following
    fireEvent.click(
      dialog.getByRole("checkbox", { name: "Take tempo from MIDI clock" }),
    )
    clockAt(140, 24)
    expect(rootStore.sequencerStore.patch.tempo).toBe(90)
  })

  describe("accent amount", () => {
    const general = async () => {
      const dialog = await open()
      fireEvent.click(dialog.getByRole("button", { name: "General" }))
      return dialog
    }
    const field = (dialog: ReturnType<typeof within>) =>
      dialog.getByRole("textbox", { name: "Accent amount" }) as HTMLInputElement
    const type = (dialog: ReturnType<typeof within>, text: string) => {
      fireEvent.focus(field(dialog))
      fireEvent.change(field(dialog), { target: { value: text } })
      fireEvent.keyDown(field(dialog), { key: "Enter" })
    }
    const amount = () => rootStore.playbackSettings.accentAmount

    it("starts at 20, shown as the swing either way", async () => {
      const dialog = await general()
      expect(amount()).toBe(20)
      expect(field(dialog).value).toBe("±20")
    })

    it("steps and takes a typed amount, like the tempo", async () => {
      const dialog = await general()
      fireEvent.click(dialog.getByRole("button", { name: "Accent amount up" }))
      expect(amount()).toBe(21)

      type(dialog, "35")
      expect(amount()).toBe(35)
      expect(field(dialog).value).toBe("±35")

      // "±12" means 12
      type(dialog, "±12")
      expect(amount()).toBe(12)
    })

    it("keeps the amount between 1 and 64, and ignores nonsense", async () => {
      const dialog = await general()
      type(dialog, "300")
      expect(amount()).toBe(64)
      type(dialog, "0")
      expect(amount()).toBe(1)
      type(dialog, "abc")
      expect(amount()).toBe(1)
    })

    it("belongs to this machine rather than the patch", async () => {
      const storage = memoryStorage()
      const first = new RootStore({ ticker: new ManualTicker(), storage })
      first.playbackSettings.setAccentAmount(33)

      const again = new RootStore({ ticker: new ManualTicker(), storage })
      expect(again.playbackSettings.accentAmount).toBe(33)
      expect(first.sequencerStore.patch).not.toHaveProperty("accentAmount")
    })
  })

  describe("language", () => {
    const language = (dialog: ReturnType<typeof within>) =>
      dialog.getByRole("combobox", { name: "Language" }) as HTMLSelectElement

    afterEach(() => {
      Object.defineProperty(globalThis.navigator, "language", {
        value: "en",
        writable: true,
      })
    })

    // first, while nothing is chosen
    it("starts in the browser's language", async () => {
      Object.defineProperty(globalThis.navigator, "language", {
        value: "ja-JP",
        writable: true,
      })
      storage = memoryStorage()
      rootStore = new RootStore({ ticker: new ManualTicker(), storage })
      render(<App rootStore={rootStore} />)
      await waitFor(() => expect(document.documentElement.lang).toBe("ja"))
      fireEvent.click(
        screen.getByRole("button", { name: ja["sequencer-settings"] }),
      )
      const dialog = within(await opened(ja["sequencer-settings"]))
      expect(
        (
          dialog.getByRole("combobox", {
            name: ja["sequencer-language"],
          }) as HTMLSelectElement
        ).value,
      ).toBe("ja")
    })

    it("offers each language by its own name, and speaks the one chosen", async () => {
      const dialog = await open()
      expect(language(dialog).value).toBe("en")
      expect(
        within(language(dialog))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["English", "Français", "Slovenčina", "日本語", "简体中文"])

      fireEvent.change(language(dialog), { target: { value: "fr" } })
      expect(document.documentElement.lang).toBe("fr")
      expect(
        dialog.getByRole("button", { name: fr["sequencer-settings-general"] }),
      ).toBeInTheDocument()
      expect(
        JSON.parse(localStorage.getItem("midiseq.settings") ?? "{}").language,
      ).toBe("fr")

      // back, for the tests after
      fireEvent.change(
        dialog.getByRole("combobox", { name: fr["sequencer-language"] }),
        { target: { value: "en" } },
      )
      expect(document.documentElement.lang).toBe("en")
    })
  })

  describe("theme", () => {
    const THEME_KEY = "midiseq.theme"
    const themeTab = async () => {
      const dialog = await open()
      fireEvent.click(dialog.getByRole("button", { name: "Theme" }))
      return dialog
    }
    const worn = () => document.documentElement.dataset.theme
    const saved = () => JSON.parse(localStorage.getItem(THEME_KEY) ?? "null")
    const names = (select: HTMLElement) =>
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent)
    const pressed = (dialog: ReturnType<typeof within>, name: string) =>
      dialog.getByRole("button", { name }).getAttribute("aria-pressed")
    const madeDark = generatedThemes.find(({ type }) => type === "dark")

    // the computer's light or dark setting, which can change while open
    const system = (dark: boolean) => {
      let isDark = dark
      const listeners = new Set<() => void>()
      vi.stubGlobal("matchMedia", (query: string) => ({
        get matches() {
          return query.includes("prefers-color-scheme") ? isDark : true
        },
        media: query,
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          listeners.delete(listener),
      }))
      return (dark: boolean) => {
        isDark = dark
        act(() => {
          for (const listener of listeners) {
            listener()
          }
        })
      }
    }

    afterEach(() => {
      localStorage.removeItem(THEME_KEY)
      vi.unstubAllGlobals()
    })

    it("has a tab of its own, and starts dark", async () => {
      const dialog = await themeTab()
      expect(pressed(dialog, "Dark")).toBe("true")
      expect(worn()).toBe("dark")
      // the made themes of each kind follow the default of that kind
      expect(
        names(dialog.getByRole("combobox", { name: "Dark theme" })),
      ).toEqual([
        "Default",
        ...generatedThemes
          .filter(({ type }) => type === "dark")
          .map(({ name }) => name),
      ])
      // the light one's out of the dark mode's reach
      expect(dialog.queryByRole("combobox", { name: "Light theme" })).toBeNull()

      fireEvent.click(dialog.getByRole("button", { name: "General" }))
      expect(dialog.queryByRole("combobox", { name: /theme/ })).toBeNull()
    })

    it("goes light, and offers the light themes instead", async () => {
      const dialog = await themeTab()
      fireEvent.click(dialog.getByRole("button", { name: "Light" }))
      expect(pressed(dialog, "Light")).toBe("true")
      expect(pressed(dialog, "Dark")).toBe("false")
      expect(worn()).toBe("light")
      expect(dialog.getByRole("combobox", { name: "Light theme" })).toHaveValue(
        "light",
      )
      expect(dialog.queryByRole("combobox", { name: "Dark theme" })).toBeNull()
      expect(saved()).toEqual({ mode: "light", dark: "dark", light: "light" })
    })

    it.skipIf(madeDark === undefined)(
      "wears the dark theme chosen, and remembers it",
      async () => {
        const made = madeDark as { id: string }
        const dialog = await themeTab()
        fireEvent.change(dialog.getByRole("combobox", { name: "Dark theme" }), {
          target: { value: made.id },
        })
        expect(worn()).toBe(made.id)
        expect(saved()).toEqual({ mode: "dark", dark: made.id, light: "light" })
      },
    )

    it("follows the computer on System, with a theme for either way", async () => {
      const setSystem = system(false)
      const dialog = await themeTab()
      fireEvent.click(dialog.getByRole("button", { name: "System" }))
      expect(worn()).toBe("light")
      expect(
        dialog.getByText("Follows your computer's light or dark setting."),
      ).toBeInTheDocument()
      expect(dialog.getByRole("combobox", { name: "Dark theme" })).toBeVisible()
      expect(
        dialog.getByRole("combobox", { name: "Light theme" }),
      ).toBeVisible()

      // the computer goes dark for the night
      setSystem(true)
      expect(worn()).toBe("dark")
      setSystem(false)
      expect(worn()).toBe("light")
    })

    it.skipIf(madeDark === undefined)(
      "keeps a theme saved before there were modes",
      async () => {
        const made = madeDark as { id: string }
        localStorage.setItem(THEME_KEY, JSON.stringify({ themeType: made.id }))
        const dialog = await themeTab()
        expect(worn()).toBe(made.id)
        expect(pressed(dialog, "Dark")).toBe("true")
        expect(
          dialog.getByRole("combobox", { name: "Dark theme" }),
        ).toHaveValue(made.id)
      },
    )

    it("goes back to the default when the theme saved has gone", async () => {
      localStorage.setItem(
        THEME_KEY,
        JSON.stringify({ mode: "dark", dark: "gone", light: "light" }),
      )
      const dialog = await themeTab()
      expect(worn()).toBe("dark")
      expect(dialog.getByRole("combobox", { name: "Dark theme" })).toHaveValue(
        "dark",
      )
    })
  })

  it("closes on Escape", async () => {
    await open()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull()
  })

  it("opens on General, then on whichever group was open last", async () => {
    const pressed = (dialog: ReturnType<typeof within>, name: string) =>
      dialog.getByRole("button", { name }).getAttribute("aria-pressed")
    let dialog = await open()
    expect(pressed(dialog, "General")).toBe("true")

    fireEvent.click(dialog.getByRole("button", { name: "MIDI Export" }))
    fireEvent.keyDown(window, { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    dialog = within(screen.getByRole("dialog", { name: "Settings" }))
    expect(pressed(dialog, "MIDI Export")).toBe("true")
    expect(pressed(dialog, "General")).toBe("false")

    // and after a reload, from this machine's settings
    const again = new RootStore({ ticker: new ManualTicker(), storage })
    expect(again.settingsTab.tab).toBe("export")
  })
})
