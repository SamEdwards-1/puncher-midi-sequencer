import { GridSize, PatchJSON, StepIndex, StepJSON } from "../entities/types"

// The grid is as near square as the steps allow, filled a row at a time, so
// 16 steps sit 4 × 4 and 64 sit 8 × 8.
export const gridWidth = (size: GridSize): number => Math.ceil(Math.sqrt(size))

export const gridRows = (size: GridSize): number =>
  Math.ceil(size / gridWidth(size))

export const stepCount = (size: GridSize): number => size

export const maxStepIndex = (size: GridSize): number => stepCount(size) - 1

/**
 * Flip reads the grid a column at a time rather than a row at a time: the
 * position a row-wise read reaches first down the first column, and so on.
 * On a square grid that swaps the axes, the step at (row, col) playing what
 * is stored at (col, row). Where the last row is short, the columns past its
 * end are a step shorter.
 */
export const viewIndex = (
  index: StepIndex,
  size: GridSize,
  flip: boolean,
): StepIndex => {
  if (!flip || index >= size) {
    return index
  }
  const width = gridWidth(size)
  const rows = gridRows(size)
  // the columns running the full height, before the short ones
  const tall = size - (rows - 1) * width
  if (index < tall * rows) {
    return (index % rows) * width + Math.floor(index / rows)
  }
  const past = index - tall * rows
  return (past % (rows - 1)) * width + tall + Math.floor(past / (rows - 1))
}

// An envelope with no points sends nothing, so it is not content.
export const hasContent = (step: StepJSON): boolean =>
  step.notes.length > 0 ||
  step.envelopes.some((envelope) => envelope.points.length > 0) ||
  step.state === "rest"

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
