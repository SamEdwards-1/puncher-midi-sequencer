import { addEnvelope, createDefaultPatch } from "@midiseq/core"
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
import { ManualTicker } from "../../test/fakes"
import { fileItem } from "../../test/menus"
import { App } from "../App/App"

// A save picker that keeps what it is asked and what is written through it.
const fakeSaving = () => {
  const written: unknown[] = []
  const asked: { suggestedName?: string; types?: unknown }[] = []
  const handle = {
    name: "song.mid",
    createWritable: async () => ({
      write: async (contents: unknown) => {
        written.push(contents)
      },
      close: async () => {},
    }),
  } as unknown as FileSystemFileHandle
  return {
    written,
    asked,
    service: new FileService({
      showSaveFilePicker: async (options) => {
        asked.push(options as (typeof asked)[number])
        return handle
      },
    }),
  }
}

let rootStore: RootStore
let saving: ReturnType<typeof fakeSaving>

const dialog = () => within(screen.getByRole("dialog", { name: "Export MIDI" }))
const box = (name: string) => dialog().getByRole("checkbox", { name })

beforeEach(() => {
  vi.spyOn(window, "alert").mockImplementation(() => {})
  saving = fakeSaving()
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    fileService: saving.service,
    storage: null,
  })
  let patch = createDefaultPatch()
  patch.pace = "4th"
  patch.steps[0].notes = [60]
  patch.steps[1].notes = [64]
  patch.voices[2].enabled = true
  // brightness on channel 2 across both steps, and the mod wheel on step 2
  patch = addEnvelope(patch, 0, {
    cc: 74,
    channel: 2,
    points: [{ time: 0, value: 90 }],
  })
  patch = addEnvelope(patch, 1, {
    cc: 74,
    channel: 2,
    points: [{ time: 0, value: 30 }],
  })
  patch = addEnvelope(patch, 1, {
    cc: 1,
    channel: 1,
    points: [{ time: 0, value: 10 }],
  })
  rootStore.sequencerStore.patch = patch
  rootStore.sequencerStore.fileName = "Bassline.midiseq.json"
  render(<App rootStore={rootStore} />)
  fireEvent.click(fileItem("Export MIDI…"))
})

describe("exporting MIDI", () => {
  it("offers each voice, the voices that play already ticked", () => {
    expect(box("Voice 1")).toBeChecked()
    expect(box("Voice 3")).toBeChecked()
    // off, so it plays nothing to export
    expect(box("Voice 2")).not.toBeChecked()
    expect(box("Voice 2")).toBeDisabled()
  })

  it("offers each CC the sequence sends, all ticked, in an area of their own", () => {
    const area = within(dialog().getByRole("group", { name: "CCs" }))
    expect(
      area
        .getAllByRole("checkbox")
        .map((each) => each.getAttribute("aria-label")),
    ).toEqual(["CC 1 · ch 1", "CC 74 · ch 2"])
    expect(box("CC 1 · ch 1")).toBeChecked()
    expect(box("CC 74 · ch 2")).toBeChecked()
    // named, and with the steps that send it
    expect(dialog().getByText("Brightness · 2 steps")).toBeTruthy()
  })

  it("ticks every CC or none from one box, which shows when only some are", () => {
    const all = box("All CCs")
    expect(all).toBeChecked()

    fireEvent.click(all)
    expect(box("CC 1 · ch 1")).not.toBeChecked()
    expect(box("CC 74 · ch 2")).not.toBeChecked()
    expect(all).not.toBeChecked()

    fireEvent.click(box("CC 74 · ch 2"))
    expect(all).toBePartiallyChecked()

    // from some, it ticks the rest
    fireEvent.click(all)
    expect(box("CC 1 · ch 1")).toBeChecked()
    expect(all).toBeChecked()
  })

  it("says when the sequence sends no CCs", () => {
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }))
    act(() => {
      rootStore.sequencerStore.patch = {
        ...rootStore.sequencerStore.patch,
        steps: rootStore.sequencerStore.patch.steps.map((step) => ({
          ...step,
          envelopes: [],
        })),
      }
    })
    fireEvent.click(fileItem("Export MIDI…"))
    expect(dialog().getByText("This sequence sends no CCs.")).toBeTruthy()
    expect(dialog().queryByRole("checkbox", { name: "All CCs" })).toBeNull()
  })

  it("says how long the export runs, pass by pass", () => {
    const length = () =>
      document.querySelector("[data-export-length]")?.textContent
    // two recorded steps, a quarter note each, at 120
    expect(length()).toBe("2 steps · 0.5 bars · 0:01")
    fireEvent.click(dialog().getByRole("button", { name: "Passes up" }))
    fireEvent.click(dialog().getByRole("button", { name: "Passes up" }))
    expect(length()).toBe("6 steps · 1.5 bars · 0:03")
  })

  it("writes the MIDI file beside the patch's name", async () => {
    fireEvent.click(box("Voice 3"))
    fireEvent.click(dialog().getByRole("button", { name: "Export" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(saving.written).toHaveLength(1))
    expect(saving.asked[0].suggestedName).toBe("Bassline.mid")
    expect(JSON.stringify(saving.asked[0].types)).toContain("audio/midi")

    const bytes = saving.written[0] as Uint8Array
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd")
    // the tempo track, voice 1 and the CCs; voice 3 was left out
    expect(bytes[11]).toBe(3)
  })

  // whether the bytes hold this run anywhere
  const holds = (bytes: Uint8Array, run: number[]) =>
    bytes.some((_, at) =>
      run.every((byte, offset) => bytes[at + offset] === byte),
    )

  it("writes only the CCs ticked", async () => {
    fireEvent.click(box("CC 1 · ch 1"))
    fireEvent.click(dialog().getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saving.written).toHaveLength(1))
    const bytes = saving.written[0] as Uint8Array
    expect(holds(bytes, [0xb1, 74, 90])).toBe(true)
    expect(holds(bytes, [0xb0, 1, 10])).toBe(false)
  })

  it("puts every voice and CC on one track when asked", async () => {
    const perVoice = dialog().getByRole("button", { name: "A track per voice" })
    const combined = dialog().getByRole("button", { name: "All on one track" })
    expect(perVoice).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(combined)
    expect(combined).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(dialog().getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saving.written).toHaveLength(1))
    const bytes = saving.written[0] as Uint8Array
    // the tempo track and the one track
    expect(bytes[11]).toBe(2)
    expect(holds(bytes, [0xb1, 74, 90])).toBe(true)
  })

  it("needs something to export", () => {
    fireEvent.click(box("Voice 1"))
    fireEvent.click(box("Voice 3"))
    const exportButton = dialog().getByRole("button", { name: "Export" })
    expect(exportButton).not.toBeDisabled()
    fireEvent.click(box("All CCs"))
    expect(exportButton).toBeDisabled()
  })

  it("closes without writing on Cancel", () => {
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(saving.written).toEqual([])
  })
})

describe("exporting a step", () => {
  const step = (number: number) =>
    fireEvent.click(screen.getByRole("button", { name: `Step ${number}` }))

  beforeEach(() => {
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }))
  })

  it("exports the step in the editor, with that step's CCs and no passes", async () => {
    step(1)
    fireEvent.click(fileItem("Export Step MIDI…"))
    const stepDialog = within(
      screen.getByRole("dialog", { name: "Export MIDI: Step 1" }),
    )
    // step 1 has only the brightness envelope
    expect(
      within(stepDialog.getByRole("group", { name: "CCs" }))
        .getAllByRole("checkbox")
        .map((each) => each.getAttribute("aria-label")),
    ).toEqual(["CC 74 · ch 2"])
    expect(stepDialog.queryByRole("button", { name: "Passes up" })).toBeNull()

    fireEvent.click(stepDialog.getByRole("button", { name: "Export" }))
    await waitFor(() => expect(saving.written).toHaveLength(1))
    expect(saving.asked[0].suggestedName).toBe("Bassline step 1.mid")
    const bytes = saving.written[0] as Uint8Array
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd")
  })

  it("drags a step out as its MIDI file, with no dialog", () => {
    const created: Blob[] = []
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob)
      return `blob:test/${created.length}`
    })
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: "all",
      setData: (type: string, value: string) => data.set(type, value),
    }

    fireEvent.dragStart(screen.getByRole("button", { name: "Step 2" }), {
      dataTransfer,
    })
    expect(data.get("DownloadURL")).toBe(
      "audio/midi:Bassline step 2.mid:blob:test/1",
    )
    expect(created[0].type).toBe("audio/midi")
    expect(dataTransfer.effectAllowed).toBe("copy")
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("the export settings", () => {
  beforeEach(() => {
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }))
  })

  it("shows the export's options in Settings, shared with the dialogs", () => {
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "MIDI Export" }))
    const settings = within(screen.getByRole("dialog", { name: "Settings" }))
    fireEvent.click(settings.getByRole("checkbox", { name: "Voice 1" }))
    fireEvent.click(settings.getByRole("checkbox", { name: "CC 1 · ch 1" }))
    fireEvent.click(settings.getByRole("button", { name: "All on one track" }))
    fireEvent.click(settings.getByRole("button", { name: "Passes up" }))
    fireEvent.click(settings.getByRole("button", { name: "Close" }))

    fireEvent.click(fileItem("Export MIDI…"))
    expect(box("Voice 1")).not.toBeChecked()
    expect(box("CC 1 · ch 1")).not.toBeChecked()
    expect(box("CC 74 · ch 2")).toBeChecked()
    expect(
      dialog().getByRole("button", { name: "All on one track" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      document.querySelector("[data-export-length]")?.textContent,
    ).toContain("4 steps")
  })
})
