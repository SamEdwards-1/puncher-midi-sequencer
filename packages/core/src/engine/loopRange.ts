import { GridSize, PatchJSON, StepIndex, StepJSON } from "../entities/types"

export const gridWidth = (size: GridSize): number => (size === "small" ? 4 : 8)

export const stepCount = (size: GridSize): number =>
  size === "small" ? 16 : 64

export const maxStepIndex = (size: GridSize): number => stepCount(size) - 1

// Flip swaps the grid axes: the step at (row, col) plays what is stored at
// (col, row).
export const viewIndex = (
  index: StepIndex,
  size: GridSize,
  flip: boolean,
): StepIndex => {
  if (!flip) {
    return index
  }
  const width = gridWidth(size)
  const row = Math.floor(index / width)
  const col = index % width
  return col * width + row
}

export const hasContent = (step: StepJSON): boolean =>
  step.notes.length > 0 || step.ccs.length > 0 || step.state === "rest"

export const loopEndIndex = (patch: PatchJSON): StepIndex => {
  const max = maxStepIndex(patch.size)
  switch (patch.loop.mode) {
    case "all":
      return max
    case "custom":
      return Math.min(Math.max(patch.loop.end, 0), max)
    case "recorded": {
      for (let i = max; i >= 0; i--) {
        if (hasContent(patch.steps[i])) {
          return i
        }
      }
      return 0
    }
  }
}

// Step positions the sequencer may visit, in ascending order. Skips are left
// out, and flip is applied when deciding what each position holds.
export const playableSteps = (patch: PatchJSON, flip: boolean): StepIndex[] => {
  const end = loopEndIndex(patch)
  const steps: StepIndex[] = []
  for (let i = 0; i <= end; i++) {
    if (patch.steps[viewIndex(i, patch.size, flip)].state !== "skip") {
      steps.push(i)
    }
  }
  return steps
}
