import type {
  AudioRenderProgress,
  AudioRenderRequest,
} from "../audio/audioExport"

/** A render under way: the file it comes to, and a way to stop it. */
export interface AudioRenderJob {
  result: Promise<Uint8Array<ArrayBuffer>>
  cancel(): void
}

export type AudioRenderer = (
  request: AudioRenderRequest,
  onProgress: (progress: AudioRenderProgress) => void,
) => AudioRenderJob

type WorkerReply =
  | { type: "progress"; progress: AudioRenderProgress }
  | { type: "done"; bytes: Uint8Array<ArrayBuffer> }
  | { type: "error"; message: string }

export class AudioRenderCancelled extends Error {
  constructor() {
    super("The render was cancelled")
    this.name = "AudioRenderCancelled"
  }
}

/**
 * Renders on a worker, one for each render, so a render never holds the
 * page up and cancelling one simply ends its thread.
 */
export const workerAudioRenderer: AudioRenderer = (request, onProgress) => {
  const worker = new Worker(
    new URL("../audio/renderAudio.worker.ts", import.meta.url),
    { type: "module" },
  )
  let fail: (error: Error) => void = () => {}
  const result = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    fail = (error) => {
      worker.terminate()
      reject(error)
    }
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      switch (data.type) {
        case "progress":
          onProgress(data.progress)
          break
        case "done":
          worker.terminate()
          resolve(data.bytes)
          break
        case "error":
          fail(new Error(data.message))
          break
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      fail(new Error(event.message || "The render stopped unexpectedly"))
    }
  })
  // the SoundFont is the render's own, read afresh for it, so it moves to
  // the worker rather than being copied there
  worker.postMessage(request, { transfer: [request.soundFont] })
  return { result, cancel: () => fail(new AudioRenderCancelled()) }
}
