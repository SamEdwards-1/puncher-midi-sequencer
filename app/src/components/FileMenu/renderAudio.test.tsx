import { createDefaultPatch } from "@midiseq/core"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AudioRenderProgress,
  AudioRenderRequest,
} from "../../audio/audioExport"
import {
  AudioRenderCancelled,
  AudioRenderer,
} from "../../services/AudioRenderer"
import { FileService } from "../../services/FileService"
import { MemorySoundFontStorage } from "../../services/SoundFontStorage"
import RootStore from "../../stores/RootStore"
import { SoundFontStore } from "../../stores/SoundFontStore"
import { ManualTicker, soundBank } from "../../test/fakes"
import { fileItem } from "../../test/menus"
import { App } from "../App/App"

// A render that waits to be told how far along it is, and when it is done.
const fakeRenderer = () => {
  const requests: AudioRenderRequest[] = []
  let report: (progress: AudioRenderProgress) => void = () => {}
  let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => {}
  let cancelled = false
  const renderer: AudioRenderer = (request, onProgress) => {
    requests.push(request)
    report = onProgress
    let fail: (error: Error) => void = () => {}
    const result = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      finish = resolve
      fail = reject
    })
    return {
      result,
      cancel: () => {
        cancelled = true
        fail(new AudioRenderCancelled())
      },
    }
  }
  return {
    renderer,
    requests,
    report: (progress: AudioRenderProgress) => act(() => report(progress)),
    finish: (bytes: Uint8Array<ArrayBuffer>) => act(() => finish(bytes)),
    get cancelled() {
      return cancelled
    },
  }
}

// A save picker that keeps what it is asked and what is written through it.
const fakeSaving = () => {
  const written: unknown[] = []
  const asked: { suggestedName?: string; types?: unknown }[] = []
  const handle = {
    name: "song.wav",
    createWritable: async () => ({
      write: async (contents: unknown) => {
        written.push(contents)
      },
      close: async () => {},
    }),
  } as unknown as FileSystemFileHandle
  const saving = {
    written,
    asked,
    // the picker closed without a place chosen
    dismiss: false,
    service: new FileService({
      showSaveFilePicker: async (options) => {
        asked.push(options as (typeof asked)[number])
        if (saving.dismiss) {
          throw new DOMException("dismissed", "AbortError")
        }
        return handle
      },
    }),
  }
  return saving
}

let rootStore: RootStore
let saving: ReturnType<typeof fakeSaving>
let rendering: ReturnType<typeof fakeRenderer>

const dialog = () =>
  within(screen.getByRole("dialog", { name: "Render Audio" }))
const button = (name: string) => dialog().getByRole("button", { name })
const radio = (name: string) => dialog().getByRole("radio", { name })

beforeEach(() => {
  vi.spyOn(window, "alert").mockImplementation(() => {})
  saving = fakeSaving()
  rendering = fakeRenderer()
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    fileService: saving.service,
    storage: null,
    audioRenderer: rendering.renderer,
    soundFonts: new SoundFontStore(
      new MemorySoundFontStorage(),
      null,
      async () => soundBank(),
    ),
  })
  const patch = createDefaultPatch()
  patch.pace = "4th"
  patch.steps[0].notes = [60]
  patch.steps[1].notes = [64]
  rootStore.sequencerStore.patch = patch
  rootStore.sequencerStore.fileName = "Bassline.midiseq.json"
  render(<App rootStore={rootStore} />)
  fireEvent.click(fileItem("Render Audio…"))
})

describe("rendering audio", () => {
  it("starts with the patch's name and a WAV at CD quality", () => {
    expect(dialog().getByRole("textbox", { name: "File name" })).toHaveValue(
      "Bassline",
    )
    expect(radio("WAV")).toBeChecked()
    expect(radio("44.1 kHz")).toBeChecked()
    expect(radio("16-bit")).toBeChecked()
    expect(radio("Stereo")).toBeChecked()
    // names the SoundFont it plays through
    expect(dialog().getByText(/A320U\.sf2/)).toBeTruthy()
  })

  it("offers bitrates for MP3 in place of bit depths", () => {
    fireEvent.click(radio("MP3"))
    expect(dialog().queryByRole("radio", { name: "16-bit" })).toBeNull()
    expect(radio("192 kbps")).toBeChecked()
    fireEvent.click(radio("320 kbps"))
    expect(rootStore.audioExportSettings.settings).toMatchObject({
      format: "mp3",
      mp3Bitrate: 320,
    })
  })

  it("says how long the render runs, its tail included", () => {
    const length = () =>
      document.querySelector("[data-render-length]")?.textContent
    // two quarter notes at 120, and two seconds to ring out
    expect(length()).toBe("0:03")
    fireEvent.click(button("Passes up"))
    expect(length()).toBe("0:04")
  })

  it("asks where the file goes, shows its progress, then writes it", async () => {
    fireEvent.change(dialog().getByRole("textbox", { name: "File name" }), {
      target: { value: "Take 2.wav" },
    })
    fireEvent.click(radio("24-bit"))
    fireEvent.click(button("Render"))

    await waitFor(() => expect(rendering.requests).toHaveLength(1))
    // the extension typed isn't doubled
    expect(saving.asked[0].suggestedName).toBe("Take 2.wav")
    expect(JSON.stringify(saving.asked[0].types)).toContain("audio/wav")
    const [request] = rendering.requests
    expect(request.patch).toBe(rootStore.sequencerStore.patch)
    expect(request.settings).toMatchObject({ format: "wav", wavBitDepth: 24 })
    expect(new Uint8Array(request.soundFont)).toEqual(
      new Uint8Array(soundBank()),
    )

    rendering.report({ phase: "render", done: 0.42 })
    const bar = dialog().getByRole("progressbar", { name: "Render progress" })
    expect(bar).toHaveAttribute("aria-valuenow", "42")
    expect(dialog().getByText("Rendering…")).toBeTruthy()

    rendering.report({ phase: "encode", done: 0.5 })
    expect(dialog().getByText("Encoding…")).toBeTruthy()

    const bytes = new Uint8Array([1, 2, 3])
    rendering.finish(bytes)
    await waitFor(() => expect(saving.written).toEqual([bytes]))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("names an MP3 as one", async () => {
    fireEvent.click(radio("MP3"))
    fireEvent.click(button("Render"))
    await waitFor(() => expect(rendering.requests).toHaveLength(1))
    expect(saving.asked[0].suggestedName).toBe("Bassline.mp3")
    expect(JSON.stringify(saving.asked[0].types)).toContain("audio/mpeg")
  })

  it("stops the render when cancelled, writing nothing", async () => {
    fireEvent.click(button("Render"))
    await waitFor(() => expect(rendering.requests).toHaveLength(1))
    fireEvent.click(button("Cancel"))
    expect(rendering.cancelled).toBe(true)
    expect(screen.queryByRole("dialog")).toBeNull()
    await act(() => new Promise((done) => setTimeout(done, 0)))
    expect(saving.written).toEqual([])
    expect(window.alert).not.toHaveBeenCalled()
  })

  it("renders nothing when the picker is dismissed", async () => {
    saving.dismiss = true
    fireEvent.click(button("Render"))
    await act(() => new Promise((done) => setTimeout(done, 0)))
    expect(rendering.requests).toEqual([])
    // back to the options, to try again
    expect(button("Render")).toBeEnabled()
  })
})
