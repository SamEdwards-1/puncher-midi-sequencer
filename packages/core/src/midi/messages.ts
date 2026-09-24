const statusByte = (type: number, channel: number) =>
  type | ((channel - 1) & 0x0f)

export const ALL_NOTES_OFF_CC = 123

/**
 * System realtime, one byte each and no channel. Clock runs at 24 per quarter
 * note; start and stop move the transport of whoever is listening.
 */
export const MIDI_CLOCK = 0xf8
export const MIDI_START = 0xfa
export const MIDI_CONTINUE = 0xfb
export const MIDI_STOP = 0xfc

export const CLOCKS_PER_BEAT = 24

export type ClockMessage = "clock" | "start" | "continue" | "stop"

export const clockBytes = (message: ClockMessage): number[] => [
  {
    clock: MIDI_CLOCK,
    start: MIDI_START,
    continue: MIDI_CONTINUE,
    stop: MIDI_STOP,
  }[message],
]

// Channels are 1-based, as shown to the user.
export const noteOnBytes = (
  channel: number,
  note: number,
  velocity: number,
): number[] => [statusByte(0x90, channel), note & 0x7f, velocity & 0x7f]

export const noteOffBytes = (channel: number, note: number): number[] => [
  statusByte(0x80, channel),
  note & 0x7f,
  0,
]

export const controlChangeBytes = (
  channel: number,
  controller: number,
  value: number,
): number[] => [statusByte(0xb0, channel), controller & 0x7f, value & 0x7f]

export const allNotesOffBytes = (channel: number): number[] =>
  controlChangeBytes(channel, ALL_NOTES_OFF_CC, 0)
