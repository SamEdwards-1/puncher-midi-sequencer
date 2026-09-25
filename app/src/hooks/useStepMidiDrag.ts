import { StepIndex } from "@midiseq/core"
import { DragEvent, useCallback, useEffect, useRef } from "react"
import { useMidiExport } from "../actions/file"
import { MIDI_FILE } from "../services/FileService"

/**
 * Dragging a step out of the browser as a MIDI file, made with the export
 * settings the moment the drag starts, with no dialog. Chrome and Edge take
 * a file dragged out of a page as a DownloadURL — "type:name:url" — and
 * write it wherever it is dropped: the desktop, a folder, or an app that
 * takes files. Other browsers ignore it, and the drag carries nothing.
 *
 * The file's address has to outlive the drop, which comes after the drag
 * has ended, so each is let go when the next drag starts.
 */
export function useStepMidiDrag() {
  const { stepFile } = useMidiExport()
  const last = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (last.current !== null) {
        URL.revokeObjectURL(last.current)
      }
    },
    [],
  )

  return useCallback(
    (step: StepIndex, event: DragEvent) => {
      const transfer = event.dataTransfer
      if (transfer === null) {
        return
      }
      const { bytes, name } = stepFile(step)
      const type = MIDI_FILE.mimeType ?? "audio/midi"
      const url = URL.createObjectURL(new Blob([bytes], { type }))
      if (last.current !== null) {
        URL.revokeObjectURL(last.current)
      }
      last.current = url
      transfer.effectAllowed = "copy"
      transfer.setData("DownloadURL", `${type}:${name}:${url}`)
    },
    [stepFile],
  )
}
