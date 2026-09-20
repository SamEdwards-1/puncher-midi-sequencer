import { StepJSON, VoiceIndex } from "@midiseq/core"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"

// View state, kept out of the patch so it is never saved or undone.
const selectedVoiceAtom = atom<VoiceIndex>(0)
const selectedStepAtom = atom(0)
// an in-app clipboard, so copying a step needs no clipboard permission
const copiedStepAtom = atom<StepJSON | null>(null)

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
