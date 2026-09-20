// The part of a Web MIDI output the router needs. `MIDIOutput` satisfies it,
// and tests use simple fakes.
export interface MIDISink {
  send(data: number[], timestamp?: number): void
  // cancels queued messages; not every browser implements it
  clear?(): void
}
