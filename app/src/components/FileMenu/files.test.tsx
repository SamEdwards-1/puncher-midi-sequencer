import { createDefaultPatch, createFile, serializeFile } from "@midiseq/core"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
