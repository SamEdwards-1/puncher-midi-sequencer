import { StepJSON, VoiceIndex } from "@midiseq/core"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"

// View state, kept out of the patch so it is never saved or undone.
const selectedVoiceAtom = atom<VoiceIndex>(0)
const selectedStepAtom = atom(0)
// an in-app clipboard, so copying a step needs no clipboard permission
const copiedStepAtom = atom<StepJSON | null>(null)

/**
 * What a click on the grid does. Normally it selects a step; a mode makes it
 * set a jump target instead, or mark steps as rests or skips.
 */
export type GridMode = "dest" | "normal" | "rest" | "skip"
const gridModeAtom = atom<GridMode | null>(null)

export function useGridMode() {
  return useAtom(gridModeAtom)
}

export function useSelectedVoice() {
  return useAtom(selectedVoiceAtom)
}

export function useSelectedStep() {
  return useAtom(selectedStepAtom)
}

export function useSetSelectedStep() {
  return useSetAtom(selectedStepAtom)
}

export function useCopiedStep() {
  return {
    copiedStep: useAtomValue(copiedStepAtom),
    setCopiedStep: useSetAtom(copiedStepAtom),
  }
}
