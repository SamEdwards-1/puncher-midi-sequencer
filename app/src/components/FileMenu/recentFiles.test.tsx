import {
  createDefaultPatch,
  createFile,
  noteOff,
  noteOn,
  serializeFile,
  writeMidiFile,
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
import { FileService } from "../../services/FileService"
import {
  MemoryRecentFilesStorage,
  RecentFilesStorage,
} from "../../services/RecentFilesStorage"
import { RecentFilesStore } from "../../stores/RecentFilesStore"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { fileItem } from "../../test/menus"
import { App } from "../App/App"

const patchText = (tempo: number) =>
  serializeFile(createFile({ ...createDefaultPatch(), tempo }))

const midiBytes = () =>
  writeMidiFile({
    ppq: 480,
    bpm: 100,
    tracks: [
      {
        name: "Lead",
        events: [
          { tick: 0, data: noteOn(1, 60, 100) },
          { tick: 480, data: noteOff(1, 60) },
        ],
      },
    ],
  })

/**
 * Files on a pretend disk, each with a handle as a picker gives, which can
 * be taken away to see a file that has since gone. `picks` are what the
 * pickers hand over, in turn.
 */
const disk = () => {
  const files = new Map<string, () => string | Uint8Array>()
  const handles = new Map<string, FileSystemFileHandle>()
  const handle = (name: string) => {
    const existing = handles.get(name)
    if (existing !== undefined) {
      return existing
    }
    const made = {
      name,
      getFile: async () => {
        const contents = files.get(name)
        if (contents === undefined) {
          throw new DOMException(
            "A requested file was not found",
            "NotFoundError",
          )
        }
        const value = contents()
        return {
          name,
          text: async () => value,
          arrayBuffer: async () => (value as Uint8Array).buffer,
        }
      },
      createWritable: async () => ({
        write: async (text: string) => {
          files.set(name, () => text)
        },
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle
    handles.set(name, made)
    return made
  }
  const picks: string[] = []
  const service = new FileService({
    showOpenFilePicker: async () => [handle(picks.shift() ?? "none")],
    showSaveFilePicker: async () => handle(picks.shift() ?? "none"),
  })
  return { files, picks, service }
}

let rootStore: RootStore
const patch = () => rootStore.sequencerStore.patch

const setup = (
  files: ReturnType<typeof disk>,
  storage: RecentFilesStorage = new MemoryRecentFilesStorage(),
) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
    fileService: files.service,
    recentFiles: new RecentFilesStore(storage),
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  rootStore.sequencerStore.isSaved = true
  return render(<App rootStore={rootStore} />)
}

const openMenu = () => {
  if (screen.queryByRole("menu", { name: "File" }) === null) {
    fireEvent.click(screen.getByRole("button", { name: "File" }))
  }
}

// the names in one of the menu's recent lists, top first; none when it's not shown
const recent = (group: string) => {
  openMenu()
  const shown = screen.queryByRole("group", { name: group })
  const names =
    shown === null
      ? []
      : within(shown)
          .queryAllByRole("button")
          .map((each) => each.textContent)
  fireEvent.click(screen.getByRole("button", { name: "File" }))
  return names
}
const recentPatches = () => recent("Recent patches")
const recentMidi = () => recent("Recent MIDI imports")

const openFile = async (name: string, files: ReturnType<typeof disk>) => {
  files.picks.push(name)
  fireEvent.click(fileItem("Open…"))
  await waitFor(() => expect(rootStore.sequencerStore.fileName).toBe(name))
}

const importFile = async (name: string, files: ReturnType<typeof disk>) => {
  files.picks.push(name)
  fireEvent.click(fileItem("Import MIDI…"))
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: /Import MIDI/ })).toBeTruthy(),
  )
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true)
  vi.spyOn(window, "alert").mockImplementation(() => {})
})

describe("recent patches", () => {
  it("lists patches opened and saved, newest first", async () => {
    const files = disk()
    files.files.set("a.midiseq.json", () => patchText(90))
    setup(files)
    expect(recentPatches()).toEqual([])

    await openFile("a.midiseq.json", files)
    await waitFor(() => expect(recentPatches()).toEqual(["a.midiseq.json"]))

    files.picks.push("b.midiseq.json")
    fireEvent.click(fileItem("Save as…"))
    await waitFor(() =>
      expect(recentPatches()).toEqual(["b.midiseq.json", "a.midiseq.json"]),
    )
  })

  it("opens one again without asking where it is", async () => {
    const files = disk()
    files.files.set("a.midiseq.json", () => patchText(90))
    files.files.set("b.midiseq.json", () => patchText(140))
    setup(files)
    await openFile("a.midiseq.json", files)
    await openFile("b.midiseq.json", files)
    await waitFor(() => expect(recentPatches()).toHaveLength(2))

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "a.midiseq.json" }))

    await waitFor(() => expect(patch().tempo).toBe(90))
    expect(rootStore.sequencerStore.fileName).toBe("a.midiseq.json")
    expect(patch().name).toBe("a")
    expect(rootStore.sequencerStore.isSaved).toBe(true)
    // it moves back to the top, once
    await waitFor(() =>
      expect(recentPatches()).toEqual(["a.midiseq.json", "b.midiseq.json"]),
    )
    // and Save writes back to it
    expect(rootStore.fileService.canWriteInPlace).toBe(true)
  })

  it("keeps the five newest", async () => {
    const files = disk()
    const names = Array.from({ length: 7 }, (_, n) => `${n}.midiseq.json`)
    for (const name of names) {
      files.files.set(name, () => patchText(100))
    }
    setup(files)
    for (const name of names) {
      await openFile(name, files)
    }

    await waitFor(() =>
      expect(recentPatches()).toEqual([
        "6.midiseq.json",
        "5.midiseq.json",
        "4.midiseq.json",
        "3.midiseq.json",
        "2.midiseq.json",
      ]),
    )
  })

  it("takes a file that has gone off the list, saying so", async () => {
    const files = disk()
    files.files.set("a.midiseq.json", () => patchText(90))
    setup(files)
    await openFile("a.midiseq.json", files)
    await waitFor(() => expect(recentPatches()).toHaveLength(1))
    files.files.delete("a.midiseq.json")

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "a.midiseq.json" }))

    await waitFor(() => expect(recentPatches()).toEqual([]))
    expect(vi.mocked(window.alert).mock.lastCall?.[0]).toMatch(
      /Couldn't find a\.midiseq\.json/,
    )
  })

  it("asks before opening one over unsaved changes", async () => {
    const files = disk()
    files.files.set("a.midiseq.json", () => patchText(90))
    setup(files)
    await openFile("a.midiseq.json", files)
    await waitFor(() => expect(recentPatches()).toHaveLength(1))
    rootStore.sequencerStore.isSaved = false
    rootStore.sequencerStore.patch = { ...patch(), tempo: 133 }
    vi.mocked(window.confirm).mockReturnValue(false)

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "a.midiseq.json" }))
    await act(async () => {})

    expect(patch().tempo).toBe(133)
  })
})

describe("recent MIDI imports", () => {
  it("lists MIDI files imported apart from the patches", async () => {
    const files = disk()
    files.files.set("a.midiseq.json", () => patchText(90))
    files.files.set("groove.mid", midiBytes)
    setup(files)

    await openFile("a.midiseq.json", files)
    await importFile("groove.mid", files)

    await waitFor(() => expect(recentMidi()).toEqual(["groove.mid"]))
    expect(recentPatches()).toEqual(["a.midiseq.json"])
  })

  it("imports one again without asking where it is", async () => {
    const files = disk()
    files.files.set("groove.mid", midiBytes)
    setup(files)
    await importFile("groove.mid", files)
    await waitFor(() => expect(recentMidi()).toHaveLength(1))

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "groove.mid" }))

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Import MIDI/ })).toBeTruthy(),
    )
    expect(files.picks).toEqual([])
  })
})

describe("between visits", () => {
  it("brings both lists back", async () => {
    const files = disk()
    files.files.set("a.midiseq.json", () => patchText(90))
    files.files.set("groove.mid", midiBytes)
    const storage = new MemoryRecentFilesStorage()
    const first = setup(files, storage)
    await openFile("a.midiseq.json", files)
    await importFile("groove.mid", files)
    await waitFor(() => expect(recentMidi()).toHaveLength(1))
    first.unmount()

    setup(files, storage)
    await act(() => rootStore.recentFiles.init())

    expect(recentPatches()).toEqual(["a.midiseq.json"])
    expect(recentMidi()).toEqual(["groove.mid"])
  })
})
