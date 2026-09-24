import {
  createDefaultPatch,
  createFile,
  createPatternsFile,
  parseFile,
  serializeFile,
  serializePatterns,
} from "@midiseq/core"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AutoSaveService } from "../../services/AutoSaveService"
import { FileService } from "../../services/FileService"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

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

// A stand-in for the browser's file pickers, holding one file in memory.
const fakeFiles = (opened?: string) => {
  const written: string[] = []
  const handle = {
    name: "song.midiseq.json",
    getFile: async () => ({
      name: "song.midiseq.json",
      text: async () => opened ?? "",
    }),
    createWritable: async () => ({
      write: async (text: string) => {
        written.push(text)
      },
      close: async () => {},
    }),
  } as unknown as FileSystemFileHandle

  return {
    written,
    service: new FileService({
      showOpenFilePicker: async () => [handle],
      showSaveFilePicker: async () => handle,
    }),
  }
}

let rootStore: RootStore
const patch = () => rootStore.sequencerStore.patch
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

const setup = (
  options: Partial<ConstructorParameters<typeof RootStore>[0]> = {},
) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    ...options,
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  rootStore.sequencerStore.isSaved = true
  render(<App rootStore={rootStore} />)
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true)
  vi.spyOn(window, "alert").mockImplementation(() => {})
})

describe("files", () => {
  it("marks the patch unsaved once it is edited", () => {
    setup()
    expect(rootStore.sequencerStore.isSaved).toBe(true)

    click("Tempo up")
    expect(rootStore.sequencerStore.isSaved).toBe(false)
  })

  it("saves the patch to a file", async () => {
    const files = fakeFiles()
    setup({ fileService: files.service })
    click("Tempo up")

    click("File")
    click("Save")

    await waitFor(() => expect(files.written).toHaveLength(1))
    expect(JSON.parse(files.written[0])).toMatchObject({
      format: "midiseq",
      version: 1,
      patch: { tempo: 121 },
    })
    expect(rootStore.sequencerStore.isSaved).toBe(true)
    expect(rootStore.sequencerStore.fileName).toBe("song.midiseq.json")
  })

  it("opens a file and replaces the patch", async () => {
    const saved = { ...createDefaultPatch(), tempo: 96, name: "Opened" }
    const files = fakeFiles(serializeFile(createFile(saved)))
    setup({ fileService: files.service })

    click("File")
    click("Open…")

    await waitFor(() => expect(patch().tempo).toBe(96))
    expect(rootStore.sequencerStore.isSaved).toBe(true)
    // opening starts a fresh history
    expect(rootStore.history.canUndo).toBe(false)
  })

  it("explains when a file can't be read", async () => {
    const files = fakeFiles("nonsense")
    setup({ fileService: files.service })
    const alert = vi.mocked(window.alert)

    click("File")
    click("Open…")

    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(alert.mock.calls[0][0]).toMatch(/Couldn't open that file/)
    // the patch is left alone
    expect(patch().tempo).toBe(120)
  })

  it("starts a new patch", async () => {
    setup()
    click("Tempo up")

    click("File")
    click("New")

    await waitFor(() => expect(patch().tempo).toBe(120))
    expect(rootStore.sequencerStore.fileName).toBeNull()
  })
})

describe("autosave", () => {
  it("keeps unsaved work and brings it back", () => {
    const storage = memoryStorage()
    const store = new RootStore({
      requestMIDIAccess: null,
      ticker: new ManualTicker(),
      storage,
    })
    store.sequencerStore.patch = { ...createDefaultPatch(), tempo: 132 }
    store.autoSave.save()

    const reopened = new RootStore({
      requestMIDIAccess: null,
      ticker: new ManualTicker(),
      storage,
    })
    act(() => reopened.init())

    expect(reopened.sequencerStore.patch.tempo).toBe(132)
    // it comes back as work still to be saved
    expect(reopened.sequencerStore.isSaved).toBe(false)
    reopened.autoSave.stop()
  })

  it("writes nothing once the patch is saved", () => {
    const storage = memoryStorage()
    const autoSave = new AutoSaveService(
      () => createDefaultPatch(),
      () => true,
      storage,
    )
    autoSave.save()
    expect(storage.getItem("midiseq.autosave")).toBeNull()
  })
})

// Pickers that record what they were asked for, and hand over one file.
const recordingPickers = (opened = "") => {
  const saves: { suggestedName: string; extension: string }[] = []
  const opens: string[] = []
  const written: string[] = []
  const extensionOf = (options: unknown) =>
    (options as { types: { accept: Record<string, string[]> }[] }).types[0]
      .accept["application/json"][0]
  const handle = (name: string) =>
    ({
      name,
      getFile: async () => ({ name, text: async () => opened }),
      createWritable: async () => ({
        write: async (text: string) => {
          written.push(text)
        },
        close: async () => {},
      }),
    }) as unknown as FileSystemFileHandle

  return {
    saves,
    opens,
    written,
    service: new FileService({
      showOpenFilePicker: async (options) => {
        opens.push(extensionOf(options))
        return [handle("picked.json")]
      },
      showSaveFilePicker: async (options) => {
        const { suggestedName } = options as { suggestedName: string }
        saves.push({ suggestedName, extension: extensionOf(options) })
        return handle(suggestedName)
      },
    }),
  }
}

describe("saving everything", () => {
  it("saves the voice settings and dots edited in the panels", async () => {
    const files = recordingPickers()
    setup({ fileService: files.service })
    const voices = screen.getByRole("region", { name: "Voices" })
    fireEvent.click(screen.getByRole("button", { name: "Voice 3" }))
    fireEvent.change(within(voices).getByLabelText("Rule"), {
      target: { value: "fall" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Voice 2 Dot 6" }))
    fireEvent.change(
      within(screen.getByRole("region", { name: "Sequencer" })).getByLabelText(
        "Direction",
      ),
      { target: { value: "bwd" } },
    )

    click("File")
    click("Save")

    await waitFor(() => expect(files.written).toHaveLength(1))
    const saved = parseFile(files.written[0])
    expect(saved.ok && saved.patch).toEqual(patch())
    expect(patch().voices[2].rule).toBe("fall")
    expect(patch().voices[1].pattern[5].on).toBe(false)
    expect(patch().direction).toBe("bwd")
  })
})

describe("pattern files", () => {
  it("exports every voice's dots as a patterns file", async () => {
    const files = recordingPickers()
    setup({ fileService: files.service })
    fireEvent.click(screen.getByRole("button", { name: "Voice 4 Dot 2" }))

    click("Export patterns")

    await waitFor(() => expect(files.written).toHaveLength(1))
    const exported = JSON.parse(files.written[0])
    expect(exported.format).toBe("midiseq-patterns")
    expect(exported.voices[3].pattern[1].on).toBe(false)
    expect(exported).not.toHaveProperty("patch")
    expect(files.saves).toEqual([
      {
        suggestedName: "untitled.midiseqpat.json",
        extension: ".midiseqpat.json",
      },
    ])
  })

  it("leaves the patch's own file alone when exporting", async () => {
    const files = recordingPickers()
    setup({ fileService: files.service })
    rootStore.sequencerStore.fileName = "Bassline.midiseq.json"
    fireEvent.click(screen.getByRole("button", { name: "Voice 1 Dot 1" }))

    click("Export patterns")
    await waitFor(() => expect(files.written).toHaveLength(1))

    expect(files.saves[0].suggestedName).toBe("Bassline.midiseqpat.json")
    // Save still asks where the patch goes, rather than writing over the
    // patterns, and the patch still counts as unsaved
    expect(rootStore.fileService.canWriteInPlace).toBe(false)
    expect(rootStore.sequencerStore.fileName).toBe("Bassline.midiseq.json")
    expect(rootStore.sequencerStore.isSaved).toBe(false)
  })

  it("imports patterns into every voice as one undoable edit", async () => {
    const source = createDefaultPatch()
    source.voices[0].pattern[0] = { ...source.voices[0].pattern[0], on: false }
    source.voices[2].patternLength = 6
    source.voices[3].pattern[9] = {
      ...source.voices[3].pattern[9],
      ratchet: 4,
      condition: "last",
    }
    source.voices[2].rule = "fall"
    const files = recordingPickers(
      serializePatterns(createPatternsFile(source)),
    )
    setup({ fileService: files.service })
    const before = patch()

    click("Import patterns")

    await waitFor(() => expect(patch().voices[2].patternLength).toBe(6))
    expect(files.opens).toEqual([".midiseqpat.json"])
    expect(patch().voices[0].pattern[0].on).toBe(false)
    expect(patch().voices[3].pattern[9]).toMatchObject({
      ratchet: 4,
      condition: "last",
    })
    // only the patterns come across
    expect(patch().voices[2].rule).toBe("nth")

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(patch()).toBe(before)
  })

  it("explains when a file isn't patterns, and changes nothing", async () => {
    const files = recordingPickers(
      serializeFile(createFile(createDefaultPatch())),
    )
    setup({ fileService: files.service })
    const before = patch()
    const alert = vi.mocked(window.alert)

    click("Import patterns")

    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(alert.mock.lastCall?.[0]).toMatch(/Couldn't import those patterns/)
    expect(patch()).toBe(before)
  })

  // Chrome refuses a picker it doesn't like with a TypeError; that must not
  // look like a dismissed picker, or the button seems dead
  const refusingPickers = () =>
    new FileService({
      showOpenFilePicker: async () => {
        throw new TypeError("Extension contains invalid characters.")
      },
      showSaveFilePicker: async () => {
        throw new TypeError("Extension contains invalid characters.")
      },
    })

  it("says so when the browser won't open a picker", async () => {
    setup({ fileService: refusingPickers() })
    const alert = vi.mocked(window.alert)
    const before = patch()

    click("Export patterns")
    await waitFor(() =>
      expect(alert.mock.lastCall?.[0]).toMatch(
        /Couldn't export the patterns\. Extension contains invalid/,
      ),
    )

    click("Import patterns")
    await waitFor(() =>
      expect(alert.mock.lastCall?.[0]).toMatch(/Couldn't import patterns\./),
    )
    expect(patch()).toBe(before)
  })

  it("stays quiet when the picker is simply closed", async () => {
    const closed = async () => {
      throw new DOMException("The user aborted a request.", "AbortError")
    }
    setup({
      fileService: new FileService({
        showOpenFilePicker: closed,
        showSaveFilePicker: closed,
      }),
    })
    const alert = vi.mocked(window.alert)
    alert.mockClear()

    click("Export patterns")
    click("Import patterns")
    await act(async () => {})

    expect(alert).not.toHaveBeenCalled()
  })
})
