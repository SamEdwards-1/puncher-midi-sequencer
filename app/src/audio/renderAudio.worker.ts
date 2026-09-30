import type { AudioWorkerMessage, AudioWorkerReply } from "./audioExport"
import { renderAudio } from "./renderAudio"

// Pieces of the file sent to the page and not yet written, at most: the
// render waits for the page to catch up, so it never holds more than these.
const UNWRITTEN = 4

let unwritten = 0
let caughtUp: () => void = () => {}

const reply = (message: AudioWorkerReply, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer })

// A piece of the file, moved to the page, not copied: each is a buffer of
// its own, made for it.
const send = async (bytes: Uint8Array<ArrayBuffer>) => {
  const own =
    bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice()
  reply({ type: "piece", bytes: own }, [own.buffer])
  unwritten++
  while (unwritten >= UNWRITTEN) {
    await new Promise<void>((resolve) => {
      caughtUp = resolve
    })
  }
}

/**
 * A render on a thread of its own, so the page carries on while it runs. It
 * takes one request, tells its progress as it goes, and hands back the file
 * a piece at a time, then that it is done, or why it stopped.
 */
self.onmessage = async ({ data }: MessageEvent<AudioWorkerMessage>) => {
  if (data.type === "written") {
    unwritten--
    caughtUp()
    return
  }
  try {
    await renderAudio(data.request, send, (progress) =>
      reply({ type: "progress", progress }),
    )
    reply({ type: "done" })
  } catch (error) {
    reply({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
