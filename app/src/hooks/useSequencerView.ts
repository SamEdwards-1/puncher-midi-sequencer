import {
  EnvelopeValues,
  PatternStepJSON,
  StepJSON,
  StepState,
  VoiceDot,
  VoiceIndex,
} from "@midiseq/core"
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { useCallback, useMemo } from "react"

// View state, kept out of the patch so it is never saved or undone.
const selectedVoiceAtom = atom<VoiceIndex>(0)
const selectedStepAtom = atom(0)
// an in-app clipboard, so copying a step needs no clipboard permission
const copiedStepAtom = atom<StepJSON | null>(null)
const copiedDotAtom = atom<PatternStepJSON | null>(null)

export function useCopiedDot() {
  return useAtom(copiedDotAtom)
}

// a CC lane's values, which paste into any CC on any step
const copiedEnvelopeAtom = atom<EnvelopeValues | null>(null)

export function useCopiedEnvelope() {
  return useAtom(copiedEnvelopeAtom)
}

// Counts imports, so the grid can greet each with its steps bouncing in.
const gridLandingAtom = atom(0)

export function useGridLanding() {
  return useAtomValue(gridLandingAtom)
}

export function useLandGrid() {
  const set = useSetAtom(gridLandingAtom)
  return () => set((count) => count + 1)
}

/**
 * The last edit made to one step in place — cleared, pasted onto, or a step
 * inserted or deleted there — so the grid can move its steps to show it.
 * `id` counts the edits, so the same one twice over is still news. An
 * insert that pushes a step with notes off the grid's end says what state
 * that step was in, so the grid can show it falling away.
 */
export type GridEditKind = "clear" | "paste" | "insert" | "delete"
export interface GridEdit {
  kind: GridEditKind
  step: number
  id: number
  pushedOff?: StepState
}
const gridEditAtom = atom<GridEdit | null>(null)

export function useGridEdit() {
  return useAtomValue(gridEditAtom)
}

export function useShowGridEdit() {
  const set = useSetAtom(gridEditAtom)
  return useCallback(
    (kind: GridEditKind, step: number, pushedOff?: StepState) =>
      set((last) => ({ kind, step, id: (last?.id ?? 0) + 1, pushedOff })),
    [set],
  )
}

/**
 * What a click on the grid does. Normally it selects a step; a mode makes it
 * set a jump target instead.
 */
export type GridMode = "dest" | "normal"
const gridModeAtom = atom<GridMode | null>(null)

export function useGridMode() {
  return useAtom(gridModeAtom)
}

// Whether clicking a step sounds it. Remembered between visits.
const previewOnClickAtom = atomWithStorage("midiseq.previewOnClick", true)

export function usePreviewOnClick() {
  return useAtom(previewOnClickAtom)
}

// The envelope editor's tool, grid and open lane. The grid is a note value
// in beats; the lane is a voice's velocity or a CC envelope, by its id.
export type EnvelopeTool = "edit" | "draw" | "erase"
// A CC lane is its number and channel rather than one step's envelope, so
// the tab stays open from step to step.
export type EnvelopeLane =
  | { kind: "velocity"; voice: VoiceIndex }
  | { kind: "cc"; cc: number; channel: number }
const envelopeToolAtom = atom<EnvelopeTool>("edit")
const envelopeGridAtom = atom(0.25)
const selectedLaneAtom = atom<EnvelopeLane | null>(null)

export function useEnvelopeTool() {
  return useAtom(envelopeToolAtom)
}

export function useEnvelopeGrid() {
  return useAtom(envelopeGridAtom)
}

export function useSelectedLane() {
  return useAtom(selectedLaneAtom)
}

// The pattern dot that played the note pointed at in the envelope editor's
// piano roll, for the Voices panel to mark; null while none is pointed at,
// and while the sequence runs.
const pointedNoteDotAtom = atom<VoiceDot | null>(null)

export function usePointedNoteDot() {
  return useAtomValue(pointedNoteDotAtom)
}

export function useSetPointedNoteDot() {
  return useSetAtom(pointedNoteDotAtom)
}

// The pattern dot under the mouse in the Voices panel: its collisions bob
// wherever they are marked, and its notes come up out of the piano roll's
// dimmed ones.
const hoveredDotAtom = atom<VoiceDot | null>(null)

export function useHoveredDot() {
  return useAtom(hoveredDotAtom)
}

// Asks for the envelope editor to be brought into view: set when a lane is
// opened from elsewhere — a setting's modulation — and cleared once the
// editor has been shown, which may wait for its pane to be chosen.
const revealEnvelopeAtom = atom(false)

export function useRevealEnvelope() {
  return useAtom(revealEnvelopeAtom)
}

// Which settings pane the right-hand column shows when the window is too
// narrow for the sequencer's own column.
// The tab open where panes share a column: in one column the grid is a
// tab as well, and the one shown first; beside the grid, its Voices tab.
export type SidePane = "grid" | "voices" | "sequencer"
const sidePaneAtom = atom<SidePane>("grid")

export function useSidePane() {
  return useAtom(sidePaneAtom)
}

/**
 * Which voices were on before a solo, and the voice soloed, so un-soloing
 * it can bring them back. Soloing is only ever the voices' own Enable
 * settings; this remembers what they were.
 */
export interface SoloRestore {
  voice: VoiceIndex
  enabled: readonly boolean[]
}
const soloRestoreAtom = atom<SoloRestore | null>(null)

export function useSoloRestore() {
  return useAtom(soloRestoreAtom)
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

/**
 * The selection, for what acts as a person would from outside React's
 * rendering — an agent's tools. Each is read or set when called, so holding
 * them re-renders nothing.
 */
export function useSelectionAccess() {
  const store = useStore()
  return useMemo(
    () => ({
      selectedStep: () => store.get(selectedStepAtom),
      selectStep: (step: number) => store.set(selectedStepAtom, step),
      selectedVoice: () => store.get(selectedVoiceAtom),
      selectVoice: (voice: VoiceIndex) => store.set(selectedVoiceAtom, voice),
      // whether a click on a step sounds it
      auditions: () => store.get(previewOnClickAtom),
      // the step copied, which the grid's menu and the step editor paste
      copiedStep: () => store.get(copiedStepAtom),
      copyStep: (step: StepJSON) => store.set(copiedStepAtom, step),
    }),
    [store],
  )
}
