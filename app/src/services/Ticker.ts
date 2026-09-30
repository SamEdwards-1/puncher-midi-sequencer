export interface Ticker {
  start(onTick: () => void): void
  stop(): void
}

/**
 * A ticker its maker owns. `stop` pauses it, to be started again; `dispose`
 * ends it for good, releasing what it runs on, after which starting it does
 * nothing.
 */
export interface OwnedTicker extends Ticker {
  dispose(): void
}

export const createIntervalTicker = (intervalMs: number): OwnedTicker => {
  let id: ReturnType<typeof setInterval> | null = null
  let disposed = false
  const stop = () => {
    if (id !== null) {
      clearInterval(id)
      id = null
    }
  }
  return {
    start(onTick) {
      stop()
      if (!disposed) {
        id = setInterval(onTick, intervalMs)
      }
    },
    stop,
    dispose() {
      disposed = true
      stop()
    },
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

export const createWorkerTicker = (intervalMs: number): OwnedTicker => {
  if (
    typeof Worker === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return createIntervalTicker(intervalMs)
  }
  let worker: Worker | null = null
  let disposed = false
  const stop = () => {
    if (worker !== null) {
      worker.postMessage(0)
      worker.onmessage = null
    }
  }
  return {
    start(onTick) {
      if (disposed) {
        return
      }
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
    stop,
    dispose() {
      disposed = true
      stop()
      worker?.terminate()
      worker = null
    },
  }
}
