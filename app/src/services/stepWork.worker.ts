import type { StepWorkJob } from "./StepWork"
import { runStepWork } from "./stepWorkRunner"

self.onmessage = ({ data }: MessageEvent<StepWorkJob>) => {
  const result = runStepWork(data)
  if (result.kind === "midi") {
    self.postMessage(result, { transfer: [result.bytes.buffer] })
  } else {
    self.postMessage(result)
  }
}
