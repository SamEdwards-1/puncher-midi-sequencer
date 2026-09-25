import { describe, expect, it } from "vitest"
import { ExportSettingsStore } from "./ExportSettingsStore"

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

describe("the export settings", () => {
  it("start with everything in, a track per voice, one pass", () => {
    const settings = new ExportSettingsStore(null)
    expect(settings.voices).toEqual([true, true, true, true])
    expect(settings.excludedCCs).toEqual([])
    expect(settings.layout).toBe("perVoice")
    expect(settings.passes).toBe(1)
  })

  it("keep what was chosen for next time", () => {
    const storage = memory()
    const first = new ExportSettingsStore(storage)
    first.setVoice(2, false)
    first.setCC({ cc: 74, channel: 2 }, false)
    first.setLayout("combined")
    first.setPasses(3)

    const again = new ExportSettingsStore(storage)
    expect(again.voices).toEqual([true, true, false, true])
    expect(again.excludedCCs).toEqual(["2:74"])
    expect(again.layout).toBe("combined")
    expect(again.passes).toBe(3)
  })

  it("tick or clear several CCs at once, leaving the rest", () => {
    const settings = new ExportSettingsStore(null)
    settings.setCC({ cc: 7, channel: 1 }, false)
    const listed = [
      { cc: 1, channel: 1 },
      { cc: 74, channel: 2 },
    ]
    settings.setCCs(listed, false)
    expect(settings.excludedCCs.sort()).toEqual(["1:1", "1:7", "2:74"])
    settings.setCCs(listed, true)
    expect(settings.excludedCCs).toEqual(["1:7"])
  })

  it("keep passes in range, and ignore a broken save", () => {
    const storage = memory()
    storage.setItem("midiseq.midiExport", '{"layout":"sideways","passes":99}')
    const settings = new ExportSettingsStore(storage)
    expect(settings.layout).toBe("perVoice")
    expect(settings.passes).toBe(16)
    settings.setPasses(0)
    expect(settings.passes).toBe(1)
  })
})
