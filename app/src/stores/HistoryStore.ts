import { PatchJSON } from "@midiseq/core"
import { makeObservable, observable } from "mobx"
import { SequencerStore } from "./SequencerStore"

const LIMIT = 200
// repeated pushes with the same key inside this window count as one edit, so
// a slider drag or a held stepper is a single undo entry
const COALESCE_MS = 800

/**
 * Undo/redo for the patch. Patches are replaced rather than mutated, so a
 * snapshot is just a reference to the previous patch.
 */
export class HistoryStore {
  canUndo = false
  canRedo = false

  private undoStack: PatchJSON[] = []
  private redoStack: PatchJSON[] = []
  private lastKey: string | null = null
  private lastPushedAt = 0

  constructor(
    private readonly sequencerStore: SequencerStore,
    private readonly now: () => number = () => Date.now(),
  ) {
    makeObservable(this, {
      canUndo: observable,
      canRedo: observable,
    })
  }

  // Call before changing the patch. Pass a key for a continuous gesture.
  push = (key?: string) => {
    const now = this.now()
    if (
      key !== undefined &&
      key === this.lastKey &&
      now - this.lastPushedAt < COALESCE_MS
    ) {
      this.lastPushedAt = now
      return
    }
    this.lastKey = key ?? null
    this.lastPushedAt = now

    this.undoStack.push(this.sequencerStore.patch)
    if (this.undoStack.length > LIMIT) {
      this.undoStack.shift()
    }
    this.redoStack = []
    this.sync()
  }

  undo = () => {
    const previous = this.undoStack.pop()
    if (previous === undefined) {
      return
    }
    this.redoStack.push(this.sequencerStore.patch)
    this.sequencerStore.patch = previous
    this.endGesture()
    this.sync()
  }

  redo = () => {
    const next = this.redoStack.pop()
    if (next === undefined) {
      return
    }
    this.undoStack.push(this.sequencerStore.patch)
    this.sequencerStore.patch = next
    this.endGesture()
    this.sync()
  }

  clear = () => {
    this.undoStack = []
    this.redoStack = []
    this.endGesture()
    this.sync()
  }

  // Ends coalescing, so the next push starts a new entry.
  endGesture = () => {
    this.lastKey = null
  }

  private sync() {
    this.canUndo = this.undoStack.length > 0
    this.canRedo = this.redoStack.length > 0
  }
}
