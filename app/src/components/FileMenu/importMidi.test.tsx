import {
  controlChange,
  createDefaultPatch,
  MidiFileTrack,
  noteOff,
  noteOn,
  writeMidiFile,
} from "@midiseq/core"
import {
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
import { editItem, fileItem } from "../../test/menus"
import { App } from "../App/App"

const PPQ = 480
const note = (channel: number, key: number, start: number, length: number) => [
  { tick: start * PPQ, data: noteOn(channel, key, 100) },
  { tick: (start + length) * PPQ, data: noteOff(channel, key) },
]

/**
 * Four bars at 100: a lead in quarters on channel 1, a bass a bar at a time
 * on channel 2, drums on 10, and the lead's filter opening.
 */
const groove = (): MidiFileTrack[] => [
  {
    name: "Lead",
    events: [
      ...Array.from({ length: 16 }, (_, beat) =>
        note(1, 60 + (beat % 4) * 2, beat, 0.9),
      ).flat(),
      ...Array.from({ length: 4 }, (_, bar) => ({
        tick: bar * 4 * PPQ,
        data: controlChange(1, 74, 20 + bar * 30),
      })),
    ],
  },
  {
    name: "Bass",
    events: [36, 41, 43, 36].flatMap((key, bar) => note(2, key, bar * 4, 3.5)),
  },
  {
    name: "Drums",
    events: Array.from({ length: 16 }, (_, beat) =>
      note(10, beat % 2 === 0 ? 36 : 38, beat, 0.25),
    ).flat(),
  },
]

let rootStore: RootStore
let picked: Uint8Array

const patch = () => rootStore.sequencerStore.patch
const dialog = () => within(screen.getByRole("dialog", { name: /Import MIDI/ }))
const box = (name: string) => dialog().getByRole("checkbox", { name })
const summary = () =>
  document.querySelector("[data-import-summary]")?.textContent

// what the preview found: its canvas says, as jsdom draws nothing
const preview = () => {
  const canvas = document.querySelector("[data-preview]") as HTMLElement
  const count = (name: string) => Number(canvas.getAttribute(`data-${name}`))
  return {
    steps: count("steps"),
    dealt: count("dealt"),
    cut: count("cut"),
    filtered: count("filtered"),
  }
}

// a file read only when the test says, to see what shows meanwhile
let hold: Promise<void> | null = null

const setup = (tracks = groove()) => {
  picked = writeMidiFile({ ppq: PPQ, bpm: 100, tracks })
  hold = null
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
    fileService: new FileService({
      showOpenFilePicker: async () => [
        {
          getFile: async () => ({
            name: "groove.mid",
            arrayBuffer: async () => {
              await hold
              return picked.buffer
            },
          }),
        } as unknown as FileSystemFileHandle,
      ],
    }),
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  render(<App rootStore={rootStore} />)
}

const openImport = async () => {
  fireEvent.click(fileItem("Import MIDI…"))
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: /Import MIDI/ })).toBeTruthy(),
  )
}

beforeEach(() => {
  vi.spyOn(window, "alert").mockImplementation(() => {})
})

describe("importing MIDI", () => {
  it("offers the file's parts and CCs, drums and CCs left out to start", async () => {
    setup()
    await openImport()
    expect(
      screen.getByRole("dialog", { name: "Import MIDI: groove.mid" }),
    ).toBeTruthy()
    expect(box("Lead · ch 1")).toBeChecked()
    expect(box("Bass · ch 2")).toBeChecked()
    expect(box("Drums · ch 10")).not.toBeChecked()
    expect(box("CC 74 · ch 1")).not.toBeChecked()
    expect(box("Take the file's tempo")).toBeChecked()
    // the lead's sixteen notes and the bass's four, four to a step
    expect(summary()).toBe("Fills steps 1–5 of 64 · 5 steps of 4 notes")
  })

  it("shows the file on a piano roll, banded by the step each note goes to", async () => {
    setup()
    await openImport()
    expect(
      screen.getByRole("img", { name: "Preview: groove.mid" }),
    ).toBeTruthy()
    // the lead's sixteen notes and the bass's four, dealt into five steps
    expect(preview()).toEqual({ steps: 5, dealt: 20, cut: 0, filtered: 0 })
  })

  it("says it is reading the file until it can show it", async () => {
    setup()
    let release = () => {}
    hold = new Promise((resolve) => {
      release = resolve
    })
    fireEvent.click(fileItem("Import MIDI…"))
    const reading = () =>
      screen
        .queryAllByRole("status")
        .find((status) => status.textContent === "Reading groove.mid…")
    await waitFor(() => expect(reading()).toBeTruthy())
    expect(screen.queryByRole("dialog")).toBeNull()

    release()
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Import MIDI/ })).toBeTruthy(),
    )
    expect(reading()).toBeUndefined()
  })

  it("zooms and scrolls the roll from its ruler, as the envelope editor does", async () => {
    setup()
    await openImport()
    const ruler = dialog()
      .getByTitle(/^Ruler/)
      .closest("svg") as SVGSVGElement
    expect(ruler).toHaveAttribute("data-view", "0-1")

    // up zooms in around where it was pressed
    fireEvent.mouseDown(ruler, { clientX: 300, clientY: 10, button: 0 })
    fireEvent.mouseMove(document, { clientX: 300, clientY: -50 })
    fireEvent.mouseUp(document, { clientX: 300, clientY: -50 })
    expect(ruler.getAttribute("data-view")).not.toBe("0-1")

    // a handle drags the range, and leaves the zoom be
    const zoomed = ruler.getAttribute("data-view")
    const end = dialog().getByRole("slider", { name: "Import end" })
    fireEvent.mouseDown(end, { clientX: 300, clientY: 20, button: 0 })
    fireEvent.mouseMove(document, { clientX: 250, clientY: -40 })
    fireEvent.mouseUp(document, { clientX: 250, clientY: -40 })
    expect(ruler.getAttribute("data-view")).toBe(zoomed)
  })

  it("filters the notes as the MIDI input does, leaving out what it keeps out", async () => {
    setup()
    await openImport()
    // folded away while it lets everything through
    const filter = dialog().getByRole("button", { name: /MIDI filter/ })
    expect(filter).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(filter)
    fireEvent.click(dialog().getByRole("button", { name: "Channel 2" }))

    // the bass is filtered out: its four notes gray, and not dealt
    expect(preview()).toEqual({ steps: 4, dealt: 16, cut: 0, filtered: 4 })
    expect(summary()).toBe("Fills steps 1–4 of 64 · 4 steps of 4 notes")
    expect(dialog().getByText(/4 notes · C2–G2 · filtered out/)).toBeTruthy()

    fireEvent.click(dialog().getByRole("button", { name: "Import" }))
    expect(patch().steps[0].notes).toEqual([60, 62, 64, 66])
  })

  it("starts from the MIDI input's filter", async () => {
    setup()
    rootStore.midiDeviceStore.setFilter({ noteLow: 50, transpose: 12 })
    await openImport()
    // open, since it filters something
    expect(
      dialog().getByRole("button", { name: /MIDI filter/ }),
    ).toHaveAttribute("aria-expanded", "true")
    // the bass is below the range; the lead comes an octave up
    expect(preview().filtered).toBe(4)
    fireEvent.click(dialog().getByRole("button", { name: "Import" }))
    expect(patch().steps[0].notes).toEqual([72, 74, 76, 78])
    // and the input's own filter is left as it was
    expect(rootStore.midiDeviceStore.filter.transpose).toBe(12)
  })

  it("counts steps for the grid as it is, and marks what doesn't fit", async () => {
    setup()
    rootStore.sequencerStore.patch = {
      ...createDefaultPatch(),
      size: "small",
    }
    await openImport()
    fireEvent.click(dialog().getByRole("button", { name: "Notes a step down" }))
    fireEvent.click(dialog().getByRole("button", { name: "Notes a step down" }))
    fireEvent.click(dialog().getByRole("button", { name: "Notes a step down" }))
    // a note a step: twenty steps' worth for sixteen
    expect(summary()).toBe(
      "Fills steps 1–16 of 16 · 20 steps of 1 note · 4 notes don't fit",
    )
    expect(preview()).toMatchObject({ steps: 20, cut: 4 })
    // looping can't make room for them either
    fireEvent.click(box("Loop until the grid is full"))
    expect(preview().cut).toBe(4)
  })

  it("takes as many notes a step as chosen", async () => {
    setup()
    await openImport()
    fireEvent.click(dialog().getByRole("button", { name: "Notes a step down" }))
    expect(summary()).toBe("Fills steps 1–7 of 64 · 7 steps of 3 notes")
    fireEvent.click(dialog().getByRole("button", { name: "Import" }))
    expect(patch().steps[0].notes).toEqual([36, 60, 62])
    expect(patch().maxNotesPerStep).toBe(3)
  })

  it("sets the stretch with the handles on the ruler, a bar at a time", async () => {
    setup()
    await openImport()
    const start = dialog().getByRole("slider", { name: "Import start" })
    const end = dialog().getByRole("slider", { name: "Import end" })
    fireEvent.keyDown(start, { key: "ArrowRight" })
    fireEvent.keyDown(end, { key: "ArrowLeft" })
    expect(start).toHaveAttribute("aria-valuetext", "bar 2")
    expect(end).toHaveAttribute("aria-valuetext", "bar 4")
    // the notes starting in bars 2 and 3
    expect(summary()).toBe("Fills steps 1–3 of 64 · 3 steps of 4 notes")
  })

  it("goes round until the grid is full, from the step chosen", async () => {
    setup()
    await openImport()
    fireEvent.click(dialog().getByRole("button", { name: "From step up" }))
    fireEvent.click(box("Loop until the grid is full"))
    expect(summary()).toBe(
      "Fills steps 2–64 of 64 · round 12.6× · 5 steps of 4 notes",
    )
  })

  it("imports as one edit, and undoes as one", async () => {
    setup()
    await openImport()
    fireEvent.click(box("CC 74 · ch 1"))
    fireEvent.click(dialog().getByRole("button", { name: "Import" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    // four notes a step, in the order they play
    expect(patch().steps[0].notes).toEqual([36, 60, 62, 64])
    expect(patch().steps[1].notes).toEqual([41, 60, 62, 66])
    expect(patch().steps[0].envelopes).toMatchObject([
      { cc: 74, channel: 1, points: [{ time: 0, value: 20 }] },
    ])
    expect(patch().steps[5].notes).toEqual([])
    expect(patch().tempo).toBe(100)

    fireEvent.click(editItem("Undo"))
    expect(patch().steps[0].notes).toEqual([])
    expect(patch().tempo).toBe(120)
  })

  it("bounces the grid's steps in, in order, within 0.6s", async () => {
    setup()
    const step = (number: number) =>
      screen.getByRole("button", { name: `Step ${number}` })
    expect(step(1).className).not.toContain("step-land")

    await openImport()
    fireEvent.click(dialog().getByRole("button", { name: "Import" }))
    await waitFor(() => expect(step(1).className).toContain("step-land"))
    // one after another, the last starting 240ms in, so its 360ms bounce
    // ends at 0.6s
    expect(step(1).style.animationDelay).toBe("0ms")
    expect(parseFloat(step(33).style.animationDelay)).toBeCloseTo(
      (240 * 32) / 63,
    )
    expect(step(64).style.animationDelay).toBe("240ms")
    // and done with once it has run
    await waitFor(() => expect(step(1).className).not.toContain("step-land"), {
      timeout: 1500,
    })
  })

  it("keeps the preview in view while the options scroll under it", async () => {
    setup()
    await openImport()
    const options = document.querySelector("[data-import-options]")
    const preview = document.querySelector("[data-preview]")
    expect(options?.contains(preview)).toBe(false)
    expect(
      document.querySelector("[data-import-preview]")?.contains(preview),
    ).toBe(true)
    // the options, and the filter, are what scrolls
    expect(options?.contains(box("Lead · ch 1"))).toBe(true)
    expect(
      options?.contains(dialog().getByRole("button", { name: /MIDI filter/ })),
    ).toBe(true)
  })

  it("folds the options away, saying what they come to", async () => {
    setup()
    await openImport()
    const fold = dialog().getByRole("button", { name: /^Options/ })
    expect(fold).toHaveAttribute("aria-expanded", "true")
    expect(fold).toHaveTextContent(
      "2 of 3 tracks · 0 CCs · 4 notes a step · from step 1 · 100 BPM",
    )

    fireEvent.click(fold)
    expect(fold).toHaveAttribute("aria-expanded", "false")
    expect(dialog().queryByRole("checkbox", { name: "Lead · ch 1" })).toBeNull()
    // folded, the choices still stand
    expect(summary()).toBe("Fills steps 1–5 of 64 · 5 steps of 4 notes")

    fireEvent.click(fold)
    fireEvent.click(box("Loop until the grid is full"))
    expect(fold).toHaveTextContent("looping")
  })

  it("shortens the roll on a short screen, to leave the options room", async () => {
    const tall = window.innerHeight
    Object.defineProperty(window, "innerHeight", {
      value: 500,
      configurable: true,
    })
    try {
      setup()
      await openImport()
      const canvas = document.querySelector("[data-preview]") as HTMLElement
      expect(canvas.style.height).toBe("140px")
    } finally {
      Object.defineProperty(window, "innerHeight", {
        value: tall,
        configurable: true,
      })
    }
  })

  it("leaves the patch alone on Cancel", async () => {
    setup()
    await openImport()
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(patch().steps[0].notes).toEqual([])
  })

  it("says why a file can't be imported", async () => {
    setup()
    picked = new TextEncoder().encode("not a MIDI file")
    fireEvent.click(fileItem("Import MIDI…"))
    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        "Couldn't import that file. That isn't a MIDI file.",
      ),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("starts from the defaults in Settings → MIDI Import", async () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "MIDI Import" }))
    const settings = within(screen.getByRole("dialog", { name: "Settings" }))
    fireEvent.click(
      settings.getByRole("checkbox", { name: "Leave out the drum channel" }),
    )
    fireEvent.click(
      settings.getByRole("checkbox", { name: "Bring in the file's CCs" }),
    )
    fireEvent.click(
      settings.getByRole("checkbox", { name: "Loop until the grid is full" }),
    )
    fireEvent.click(settings.getByRole("button", { name: "Close" }))

    await openImport()
    expect(box("Drums · ch 10")).toBeChecked()
    expect(box("CC 74 · ch 1")).toBeChecked()
    expect(box("Loop until the grid is full")).toBeChecked()
  })
})
