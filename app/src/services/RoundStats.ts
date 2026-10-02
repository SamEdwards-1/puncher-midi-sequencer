import { Samples, Spread } from "./Samples"

export interface RoundCounts {
  // patch edits that had the rounds played again, and those none of them
  // hears, which had none played again
  replays: number
  unheard: number
  // rounds handed out to be played, and how many took the patch with them,
  // the worker not having it yet
  requested: number
  patchesSent: number
  // the rounds that came back played: shown, being of the latest edit;
  // shown while the latest edit's are on their way, being nearer the mark
  // than what showed before; and dropped, their round gone by or showing
  // later ones
  current: number
  stale: number
  dropped: number
  // rounds that never came back, lost with a worker that failed; the
  // failures; and the workers started, the first and any after a failure
  lost: number
  failures: number
  workers: number
}

/** How playing the rounds ahead has kept up, since it was last reset. */
export interface RoundReport extends RoundCounts {
  // In ms: posting a round, the page's share of the work; playing it, the
  // worker's; the rest of the wait for it, in transit and queued; and all
  // of it, from being asked for to coming back.
  post: Spread
  play: Spread
  wait: Spread
  latency: Spread
}

const noCounts = (): RoundCounts => ({
  replays: 0,
  unheard: 0,
  requested: 0,
  patchesSent: 0,
  current: 0,
  stale: 0,
  dropped: 0,
  lost: 0,
  failures: 0,
  workers: 0,
})

/**
 * Measures playing the rounds ahead, cheaply enough to leave on, so how it
 * keeps up can be read from the console on the device in question:
 * `midiseq.player.roundStats.report()`, and `.reset()` before trying
 * something.
 */
export class RoundStats {
  private counts = noCounts()
  private readonly post = new Samples()
  private readonly play = new Samples()
  private readonly wait = new Samples()
  private readonly latency = new Samples()

  // a patch edit, and whether any round hears it
  edited(heard: boolean) {
    this.counts[heard ? "replays" : "unheard"]++
  }

  requested() {
    this.counts.requested++
  }

  // a round posted to the worker, taking `ms` on this thread, the patch
  // with it or not
  posted(ms: number, withPatch: boolean) {
    this.post.add(ms)
    if (withPatch) {
      this.counts.patchesSent++
    }
  }

  // a round back, having taken `post` ms to post and `play` to play, and
  // `latency` in all since it was asked for
  cameBack(post: number, play: number, latency: number) {
    this.play.add(play)
    this.wait.add(Math.max(0, latency - post - play))
    this.latency.add(latency)
  }

  shown(stale: boolean) {
    this.counts[stale ? "stale" : "current"]++
  }

  dropped() {
    this.counts.dropped++
  }

  lost() {
    this.counts.lost++
  }

  failed() {
    this.counts.failures++
  }

  started() {
    this.counts.workers++
  }

  reset() {
    this.counts = noCounts()
    for (const samples of [this.post, this.play, this.wait, this.latency]) {
      samples.reset()
    }
  }

  report(): RoundReport {
    return {
      ...this.counts,
      post: this.post.spread(),
      play: this.play.spread(),
      wait: this.wait.spread(),
      latency: this.latency.spread(),
    }
  }
}
