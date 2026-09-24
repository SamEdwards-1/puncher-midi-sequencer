import { StepJSON, VoiceIndex } from "@midiseq/core"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"

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

// Whether clicking a step sounds it. Remembered between visits.
const previewOnClickAtom = atomWithStorage("midiseq.previewOnClick", true)

export function usePreviewOnClick() {
  return useAtom(previewOnClickAtom)
}

// The envelope editor's tool, grid and open CC tab. The grid is a note value
// in beats; the tab is an envelope's id, falling back to the step's first.
export type EnvelopeTool = "edit" | "draw"
const envelopeToolAtom = atom<EnvelopeTool>("edit")
const envelopeGridAtom = atom(0.25)
const selectedEnvelopeAtom = atom<number | null>(null)

export function useEnvelopeTool() {
  return useAtom(envelopeToolAtom)
}

export function useEnvelopeGrid() {
  return useAtom(envelopeGridAtom)
}

export function useSelectedEnvelope() {
  return useAtom(selectedEnvelopeAtom)
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
