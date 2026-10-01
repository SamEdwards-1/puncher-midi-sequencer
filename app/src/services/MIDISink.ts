// The part of a Web MIDI output the router needs. `MIDIOutput` satisfies it,
// and tests use simple fakes.
export interface MIDISink {
  send(data: number[], timestamp?: number): void
  // Time needed to reach this output, so scheduled notes can be heard when
  // the player's wall-clock playhead reaches them.
  minimumLeadMs?(now: number): number
  // cancels queued messages; not every browser implements it
  clear?(): void
}
