import { createDefaultPatch, createFile, serializeFile } from "@midiseq/core"
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
import RootStore from "../../stores/RootStore"
import { immediateStepWork, ManualTicker } from "../../test/fakes"
import { editItem, fileItem } from "../../test/menus"
import { App } from "../App/App"

// A stand-in for the browser's file pickers, holding one file in memory.
const fakeFiles = (opened = "") => {
  const written: string[] = []
  const handle = {
    name: "Bassline.midiseq.json",
    getFile: async () => ({
      name: "Bassline.midiseq.json",
      text: async () => opened,
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
const grid = () => within(screen.getByRole("region", { name: "Grid" }))
const title = () => grid().getByRole("button", { name: /^Patch name: / })
const field = () => grid().getByRole("textbox", { name: "Patch name" })

const setup = (fileService?: FileService) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    fileService,
    storage: null,
    stepWork: immediateStepWork(),
  })
  rootStore.sequencerStore.patch = {
    ...createDefaultPatch(),
    name: "Tidal Wren",
  }
  rootStore.sequencerStore.isSaved = true
  render(<App rootStore={rootStore} />)
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true)
  vi.spyOn(window, "alert").mockImplementation(() => {})
})

describe("the patch's name", () => {
  it("starts out made up, as two words", () => {
    rootStore = new RootStore({
      requestMIDIAccess: null,
      ticker: new ManualTicker(),
      storage: null,
    })
    expect(patch().name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
  })

  it("is the grid's title", () => {
    setup()
    expect(title()).toHaveTextContent("Tidal Wren")
  })

  it("is renamed with a click, as one undoable edit", () => {
    setup()
    fireEvent.click(title())
    expect(field()).toHaveValue("Tidal Wren")
    expect(field()).toHaveFocus()

    fireEvent.change(field(), { target: { value: "  Bassline  " } })
    fireEvent.keyDown(field(), { key: "Enter" })

    expect(title()).toHaveTextContent("Bassline")
    expect(patch().name).toBe("Bassline")
    expect(rootStore.sequencerStore.isSaved).toBe(false)

    fireEvent.click(editItem("Undo"))
    expect(patch().name).toBe("Tidal Wren")
  })

  it("keeps a rename when the field is left", () => {
    setup()
    fireEvent.click(title())
    fireEvent.change(field(), { target: { value: "Bassline" } })
    fireEvent.blur(field())
    expect(patch().name).toBe("Bassline")
  })

  it("is let be on Escape, or when left empty", () => {
    setup()
    fireEvent.click(title())
    fireEvent.change(field(), { target: { value: "Bassline" } })
    fireEvent.keyDown(field(), { key: "Escape" })
    expect(patch().name).toBe("Tidal Wren")

    fireEvent.click(title())
    fireEvent.change(field(), { target: { value: "   " } })
    fireEvent.keyDown(field(), { key: "Enter" })
    expect(patch().name).toBe("Tidal Wren")
    expect(rootStore.history.canUndo).toBe(false)
  })

  it("is saved with the patch", async () => {
    const files = fakeFiles()
    setup(files.service)
    fireEvent.click(title())
    fireEvent.change(field(), { target: { value: "Bassline" } })
    fireEvent.keyDown(field(), { key: "Enter" })

    fireEvent.click(fileItem("Save"))
    await waitFor(() => expect(files.written).toHaveLength(1))
    expect(JSON.parse(files.written[0]).patch.name).toBe("Bassline")
  })

  it("is made up afresh for a new patch", async () => {
    setup()
    fireEvent.click(fileItem("New"))
    await waitFor(() => expect(patch().name).not.toBe("Tidal Wren"))
    expect(patch().name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect(title()).toHaveTextContent(patch().name)
  })

  it("comes from the file for a patch saved without one", async () => {
    const saved = { ...createDefaultPatch(), tempo: 96, name: "" }
    setup(fakeFiles(serializeFile(createFile(saved))).service)
    fireEvent.click(fileItem("Open…"))
    await waitFor(() => expect(patch().tempo).toBe(96))
    expect(patch().name).toBe("Bassline")
    expect(rootStore.sequencerStore.isSaved).toBe(true)
  })

  it("starts the name of a step dragged out as MIDI", async () => {
    setup()
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test/1")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    rootStore.sequencerStore.fileName = "Other.midiseq.json"
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: "all",
      setData: (type: string, value: string) => data.set(type, value),
    }

    const step = grid().getByRole("button", { name: "Step 3" })
    fireEvent.pointerEnter(step)
    await act(async () => {})
    fireEvent.dragStart(step, {
      dataTransfer,
    })
    expect(data.get("DownloadURL")).toBe(
      "audio/midi:Tidal Wren step 3.mid:blob:test/1",
    )
  })

  it("leaves out what a file's name can't hold", async () => {
    setup()
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test/1")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    rootStore.sequencerStore.patch = { ...patch(), name: "A/B: take?" }
    const data = new Map<string, string>()
    const step = grid().getByRole("button", { name: "Step 1" })
    fireEvent.pointerEnter(step)
    await act(async () => {})
    fireEvent.dragStart(step, {
      dataTransfer: {
        setData: (type: string, value: string) => data.set(type, value),
      },
    })
    expect(data.get("DownloadURL")).toBe(
      "audio/midi:A-B- take- step 1.mid:blob:test/1",
    )
  })
})
