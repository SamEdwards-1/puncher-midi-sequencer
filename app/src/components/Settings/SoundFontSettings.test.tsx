import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MemorySoundFontStorage } from "../../services/SoundFontStorage"
import type { SynthLike } from "../../services/SoundFontSynth"
import { BUILTIN_OUTPUT } from "../../stores/MIDIDeviceStore"
import RootStore from "../../stores/RootStore"
import { FACTORY_SOUNDFONT, SoundFontStore } from "../../stores/SoundFontStore"
import { SynthStore } from "../../stores/SynthStore"
import { ManualTicker, soundBank } from "../../test/fakes"
import { App } from "../App/App"

const FACTORY = FACTORY_SOUNDFONT.name

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

const fakeSynth = () =>
  ({
    connect: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    controllerChange: vi.fn(),
    programChange: vi.fn(),
    isReady: Promise.resolve(),
    soundBankManager: { addSoundBank: vi.fn(async () => undefined) },
  }) as unknown as SynthLike

// a pause for the stores' promises to settle
const settle = () => act(() => new Promise((done) => setTimeout(done, 0)))

describe("the SoundFont settings", () => {
  const open = async () => {
    const storage = memoryStorage()
    const context = {
      state: "suspended",
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => undefined),
    }
    const soundFonts = new SoundFontStore(
      new MemorySoundFontStorage(),
      storage,
      async () => soundBank(),
    )
    const rootStore = new RootStore({
      ticker: new ManualTicker(),
      storage,
      requestMIDIAccess: null,
      soundFonts,
      synthStore: new SynthStore(() => context as unknown as AudioContext, {
        createSynth: async () => fakeSynth(),
      }),
    })
    await act(() => soundFonts.init())
    render(<App rootStore={rootStore} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    const dialog = within(screen.getByRole("dialog", { name: "Settings" }))
    fireEvent.click(dialog.getByRole("button", { name: "SoundFont" }))
    return { dialog, rootStore, storage }
  }

  const add = (dialog: ReturnType<typeof within>, file: File) =>
    act(async () => {
      fireEvent.change(dialog.getByLabelText("Add"), {
        target: { files: [file] },
      })
    })

  it("lists the factory set, chosen", async () => {
    const { dialog } = await open()
    const list = within(dialog.getByRole("radiogroup", { name: "SoundFonts" }))
    expect(list.getByRole("radio", { name: FACTORY })).toBeChecked()
    // the app's own can't be removed
    expect(dialog.queryByRole("button", { name: /Remove/ })).toBeNull()
    expect(
      dialog.getByText("SoundFonts you add are saved in this browser."),
    ).toBeInTheDocument()
  })

  it("adds a font from disk, chooses it, and removes it again", async () => {
    const { dialog, rootStore, storage } = await open()

    await add(dialog, new File([soundBank()], "Piano.sf2"))
    await settle()
    expect(dialog.getByRole("radio", { name: "Piano.sf2" })).toBeChecked()
    expect(dialog.getByRole("radio", { name: FACTORY })).not.toBeChecked()
    expect(storage.getItem("midiseq.soundFont")).toBe(
      String(rootStore.soundFonts.selectedId),
    )

    fireEvent.click(dialog.getByRole("radio", { name: FACTORY }))
    expect(rootStore.soundFonts.selectedId).toBe(FACTORY_SOUNDFONT.id)

    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Remove Piano.sf2" }))
    })
    await settle()
    expect(dialog.queryByRole("radio", { name: "Piano.sf2" })).toBeNull()
  })

  it("turns away a file that isn't a SoundFont", async () => {
    const { dialog } = await open()
    await add(dialog, new File(["just some notes"], "notes.txt"))
    await settle()
    expect(
      dialog.getByText(/Couldn't add it: notes.txt isn't a SoundFont/),
    ).toBeInTheDocument()
    expect(dialog.getAllByRole("radio")).toHaveLength(1)
  })

  it("loads the chosen font into the built-in synth as it is picked", async () => {
    const { dialog, rootStore } = await open()
    const { synthStore } = rootStore
    expect(
      dialog.getByText(
        "Heard once the built-in synth is chosen as an output in MIDI.",
      ),
    ).toBeInTheDocument()

    act(() => rootStore.midiDeviceStore.toggleOutput(BUILTIN_OUTPUT, true))
    await settle()
    expect(synthStore.state).toBe("ready")
    expect(synthStore.fontId).toBe(FACTORY_SOUNDFONT.id)

    await add(dialog, new File([soundBank()], "Piano.sf2"))
    await settle()
    expect(synthStore.fontId).toBe(rootStore.soundFonts.selectedId)
    expect(synthStore.fontId).not.toBe(FACTORY_SOUNDFONT.id)
  })
})
