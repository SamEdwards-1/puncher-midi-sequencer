import { StepIndex, sequenceCCs } from "@midiseq/core"
import { DragEvent, useCallback, useEffect, useRef } from "react"
import { exportOptionsFor, stepMidiNameFor } from "../actions/file"
import { MIDI_FILE } from "../services/FileService"
import { useStores } from "./useStores"

/**
 * Dragging a step out of the browser as a MIDI file, prepared in a worker
 * when the pointer approaches it. A drag uses only bytes for the current
 * patch and export settings; while they are still being prepared, the drag
 * is cancelled and can be tried again. Chrome and Edge take
 * a file dragged out of a page as a DownloadURL — "type:name:url" — and
 * write it wherever it is dropped: the desktop, a folder, or an app that
 * takes files. Other browsers ignore it, and the drag carries nothing.
 *
 * The file's address has to outlive the drop, which comes after the drag
 * has ended, so each is let go when the next drag starts.
 */
export function useStepMidiDrag() {
  const { sequencerStore, exportSettings, playbackSettings, stepWork } =
    useStores()
  const last = useRef<string | null>(null)
  const prepared = useRef<{
    patch: typeof sequencerStore.patch
    step: StepIndex
    settings: string
    name: string
    blob: Blob | null
  } | null>(null)

  const identity = useCallback(
    (step: StepIndex) => {
      const patch = sequencerStore.patch
      const options = exportOptionsFor(
        exportSettings,
        patch,
        sequenceCCs(patch, [step]),
      )
      const settings = JSON.stringify({
        options,
        accentAmount: playbackSettings.accentAmount,
        fileName: sequencerStore.fileName,
      })
      return {
        patch,
        step,
        options,
        settings,
        name: stepMidiNameFor(sequencerStore.fileName, patch.name, step),
      }
    },
    [sequencerStore, exportSettings, playbackSettings],
  )

  const prepare = useCallback(
    (step: StepIndex) => {
      const { patch, options, settings, name } = identity(step)
      const current = prepared.current
      if (
        current?.patch === patch &&
        current.step === step &&
        current.settings === settings
      )
        return
      const entry = {
        patch,
        step,
        settings,
        name,
        blob: null as Blob | null,
      }
      prepared.current = entry
      void stepWork
        .prepareMidi(patch, step, {
          ...options,
          accentAmount: playbackSettings.accentAmount,
          seed: Math.floor(Math.random() * 2 ** 32),
        })
        .then((bytes) => {
          if (prepared.current !== entry || bytes === null) return
          const buffer =
            bytes.byteOffset === 0 &&
            bytes.byteLength === bytes.buffer.byteLength
              ? bytes.buffer
              : bytes.slice().buffer
          entry.blob = new Blob([buffer as ArrayBuffer], {
            type: MIDI_FILE.mimeType ?? "audio/midi",
          })
        })
    },
    [identity, stepWork, playbackSettings],
  )

  useEffect(
    () => () => {
      if (last.current !== null) {
        URL.revokeObjectURL(last.current)
      }
    },
    [],
  )

  const drag = useCallback(
    (step: StepIndex, event: DragEvent) => {
      const transfer = event.dataTransfer
      if (transfer === null) {
        return
      }
      const { patch, settings } = identity(step)
      const current = prepared.current
      if (
        current?.patch !== patch ||
        current.step !== step ||
        current.settings !== settings ||
        current.blob === null
      ) {
        event.preventDefault()
        event.currentTarget.setAttribute(
          "title",
          "Preparing MIDI; try dragging again",
        )
        prepare(step)
        return
      }
      event.currentTarget.removeAttribute("title")
      const { blob, name } = current
      const type = MIDI_FILE.mimeType ?? "audio/midi"
      const url = URL.createObjectURL(blob)
      if (last.current !== null) {
        URL.revokeObjectURL(last.current)
      }
      last.current = url
      transfer.effectAllowed = "copy"
      transfer.setData("DownloadURL", `${type}:${name}:${url}`)
    },
    [identity, prepare],
  )
  return { prepare, drag }
}
