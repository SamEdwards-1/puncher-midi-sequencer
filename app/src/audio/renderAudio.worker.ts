import { AudioRenderRequest, renderAudio } from "./renderAudio"

/**
 * A render on a thread of its own, so the page carries on while it runs. It
 * takes one request, tells its progress as it goes, and hands back the
 * file's bytes, or why there are none.
 */
self.onmessage = async (event: MessageEvent<AudioRenderRequest>) => {
  try {
    const bytes = await renderAudio(event.data, (progress) =>
      self.postMessage({ type: "progress", progress }),
    )
    self.postMessage({ type: "done", bytes }, { transfer: [bytes.buffer] })
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
