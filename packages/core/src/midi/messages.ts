const statusByte = (type: number, channel: number) =>
  type | ((channel - 1) & 0x0f)

export const ALL_NOTES_OFF_CC = 123

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
