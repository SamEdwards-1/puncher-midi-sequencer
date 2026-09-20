import { VoiceIndex } from "@midiseq/core"
import { atom, useAtom } from "jotai"

// View state, kept out of the patch so it is never saved or undone.
const selectedVoiceAtom = atom<VoiceIndex>(0)

export function useSelectedVoice() {
  return useAtom(selectedVoiceAtom)
}
