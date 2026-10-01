# Envelope lookup performance

Envelope point lookup now uses an upper-bound binary search. The last point at
a duplicate timestamp wins; stepped values, ramps and out-of-range reads retain
the previous sampler's behavior.

CC and modulation indexes use weak keys for immutable envelope/modulation
arrays. Edits must replace the affected array, as patch commands already do.
The first envelope for a CC still wins, including an empty envelope and
regardless of channel. Voice and sequencer modulation lists retain source order;
first-match queries for targets and CCs remain first-match queries.

Empty envelopes consume no sample candidates. Their landing context and dormant
next sample survive renders, live edits and snapshots. A complete render advances
past its inclusive end; a budget-limited render leaves its reported boundary
eligible. Adding points therefore resumes without emitting into rendered history.

Run the repeatable fixtures from the repository root:

```sh
npm exec --workspace @midiseq/core -- vitest run src/engine/envelopeLookup.test.ts
npm exec --workspace @midiseq/core -- vitest bench --run src/engine/envelopeLookup.bench.ts
```

The benchmark covers 0/32/256/2,048 points, arbitrary-time reads, four modulated
voices, sequencer modulation and complete rounds across small render budgets.
Compare old/new sampler cases in the same run. Wall-clock timings are not unit
test assertions. The deterministic empty-step test avoids 191 sample candidates
in a four-beat step while preserving the note/step event stream.

For browser validation, run the same point counts during playback and live edits.
Record SchedulerStats p50/p95/p99, maximum scheduling gap and allocation profiles
separately from sampler timings. Do not equate microbenchmark timings with
browser scheduling latency or increase the render budget to hide expensive reads.
