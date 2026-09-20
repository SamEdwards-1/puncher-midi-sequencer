export interface Ticker {
  start(onTick: () => void): void
  stop(): void
}

export const createIntervalTicker = (intervalMs: number): Ticker => {
  let id: ReturnType<typeof setInterval> | null = null
  const stop = () => {
    if (id !== null) {
      clearInterval(id)
      id = null
    }
  }
  return {
    start(onTick) {
      stop()
      id = setInterval(onTick, intervalMs)
    },
    stop,
  }
}

// Browsers throttle main-thread timers in background tabs to about once a
// second, which would starve the lookahead while Signal is in front. Timers
// in a dedicated worker keep their rate, so the tick comes from one when
// workers are available.
const WORKER_SOURCE = `let id = null
onmessage = (event) => {
  clearInterval(id)
  id = event.data > 0 ? setInterval(() => postMessage(0), event.data) : null
}`

export const createWorkerTicker = (intervalMs: number): Ticker => {
  if (
    typeof Worker === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return createIntervalTicker(intervalMs)
  }
  let worker: Worker | null = null
  return {
    start(onTick) {
      if (worker === null) {
        const url = URL.createObjectURL(
          new Blob([WORKER_SOURCE], { type: "text/javascript" }),
        )
        worker = new Worker(url)
        URL.revokeObjectURL(url)
      }
      worker.onmessage = () => onTick()
      worker.postMessage(intervalMs)
    },
    stop() {
      if (worker !== null) {
        worker.postMessage(0)
        worker.onmessage = null
      }
    },
  }
}
