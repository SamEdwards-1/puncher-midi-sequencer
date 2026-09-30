import type {
  AudioRenderProgress,
  AudioRenderRequest,
  AudioWorkerMessage,
  AudioWorkerReply,
} from "../audio/audioExport"

/** A render under way: when its file is all written, and a way to stop it. */
export interface AudioRenderJob {
  result: Promise<void>
  cancel(): void
}

/**
 * Renders a request, telling its progress as it goes, and writing the file
 * a piece at a time, in order, through `write`: the next piece isn't asked
 * for until the last is written.
 */
export type AudioRenderer = (
  request: AudioRenderRequest,
  onProgress: (progress: AudioRenderProgress) => void,
  write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
) => AudioRenderJob

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
export const workerAudioRenderer: AudioRenderer = (
  request,
  onProgress,
  write,
) => {
  const worker = new Worker(
    new URL("../audio/renderAudio.worker.ts", import.meta.url),
    { type: "module" },
  )
  const tell = (message: AudioWorkerMessage, transfer: Transferable[] = []) =>
    worker.postMessage(message, { transfer })
  let over = false
  let fail: (error: Error) => void = () => {}
  const result = new Promise<void>((resolve, reject) => {
    const end = (settle: () => void) => {
      if (!over) {
        over = true
        worker.terminate()
        settle()
      }
    }
    fail = (error) => end(() => reject(error))
    // each piece written after the one before, the worker told as each is
    let writing = Promise.resolve()
    worker.onmessage = ({ data }: MessageEvent<AudioWorkerReply>) => {
      switch (data.type) {
        case "progress":
          onProgress(data.progress)
          break
        case "piece":
          writing = writing.then(async () => {
            if (!over) {
              await write(data.bytes)
              tell({ type: "written" })
            }
          })
          writing.catch(fail)
          break
        case "done":
          writing.then(() => end(resolve), fail)
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
  tell({ type: "render", request }, [request.soundFont])
  return { result, cancel: () => fail(new AudioRenderCancelled()) }
}
