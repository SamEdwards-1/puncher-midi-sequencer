import { describe, expect, it } from "vitest"
import {
  AUDIO_EXPORT_DEFAULTS,
  AudioExportSettingsStore,
} from "./AudioExportSettingsStore"

const memory = (): Storage => {
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

describe("the audio export settings", () => {
  it("start as a normalized stereo WAV at CD quality, with a tail", () => {
    expect(new AudioExportSettingsStore(null).settings).toEqual({
      format: "wav",
      sampleRate: 44100,
      channels: 2,
      wavBitDepth: 16,
      mp3Bitrate: 192,
      passes: 1,
      tail: 2,
      normalize: true,
    })
  })

  it("keep what was chosen for next time", () => {
    const storage = memory()
    const first = new AudioExportSettingsStore(storage)
    first.set("format", "mp3")
    first.set("mp3Bitrate", 320)
    first.set("channels", 1)
    first.set("normalize", false)

    expect(new AudioExportSettingsStore(storage).settings).toMatchObject({
      format: "mp3",
      mp3Bitrate: 320,
      channels: 1,
      normalize: false,
    })
  })

  it("keep passes and the tail in range", () => {
    const settings = new AudioExportSettingsStore(null)
    settings.set("passes", 99)
    settings.set("tail", -3)
    expect(settings.settings.passes).toBe(16)
    expect(settings.settings.tail).toBe(0)
  })

  it("fall back to the defaults for anything saved that makes no sense", () => {
    const storage = memory()
    storage.setItem(
      "midiseq.audioExport",
      JSON.stringify({ format: "ogg", sampleRate: 22050, wavBitDepth: 8 }),
    )
    expect(new AudioExportSettingsStore(storage).settings).toEqual(
      AUDIO_EXPORT_DEFAULTS,
    )
  })
})
