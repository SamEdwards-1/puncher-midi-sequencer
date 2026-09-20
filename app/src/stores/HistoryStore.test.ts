import { createDefaultPatch, setSequencer } from "@midiseq/core"
import { beforeEach, describe, expect, it } from "vitest"
import { HistoryStore } from "./HistoryStore"
import { SequencerStore } from "./SequencerStore"

describe("HistoryStore", () => {
  let store: SequencerStore
  let history: HistoryStore
  let clock: number

  const setTempo = (tempo: number, key?: string) => {
    history.push(key)
    store.patch = setSequencer(store.patch, { tempo })
  }

  beforeEach(() => {
    store = new SequencerStore()
    store.patch = createDefaultPatch()
    clock = 0
    history = new HistoryStore(store, () => clock)
  })

  it("undoes and redoes an edit", () => {
    expect(history.canUndo).toBe(false)

    setTempo(90)
    expect(store.patch.tempo).toBe(90)
    expect(history.canUndo).toBe(true)

    history.undo()
    expect(store.patch.tempo).toBe(120)
    expect(history.canRedo).toBe(true)

    history.redo()
    expect(store.patch.tempo).toBe(90)
  })

  it("walks back through several edits", () => {
    setTempo(90)
    setTempo(100)
    setTempo(110)

    history.undo()
    history.undo()
    expect(store.patch.tempo).toBe(90)
    history.undo()
    expect(store.patch.tempo).toBe(120)
    expect(history.canUndo).toBe(false)
  })

  it("counts one gesture as a single entry", () => {
    setTempo(121, "tempo")
    clock += 100
    setTempo(122, "tempo")
    clock += 100
    setTempo(123, "tempo")

    history.undo()
    expect(store.patch.tempo).toBe(120)
    expect(history.canUndo).toBe(false)
  })

  it("starts a new entry once a gesture goes quiet", () => {
    setTempo(121, "tempo")
    clock += 2000
    setTempo(130, "tempo")

    history.undo()
    expect(store.patch.tempo).toBe(121)
  })

  it("keeps separate gestures apart", () => {
    setTempo(121, "tempo")
    history.push("velocity")
    store.patch = setSequencer(store.patch, { shiftAmt: 5 })

    history.undo()
    expect(store.patch.shiftAmt).toBe(12)
    history.undo()
    expect(store.patch.tempo).toBe(120)
  })

  it("drops the redo trail after a new edit", () => {
    setTempo(90)
    history.undo()
    expect(history.canRedo).toBe(true)

    setTempo(100)
    expect(history.canRedo).toBe(false)
  })

  it("forgets everything when cleared", () => {
    setTempo(90)
    history.clear()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
