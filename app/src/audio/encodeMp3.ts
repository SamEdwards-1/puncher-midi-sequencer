import { Mp3Encoder } from "@breezystack/lamejs"

// Kept apart from the rest of the render so LAME, the larger part of what a
// WAV render would never use, is fetched only when MP3 is the format.

// LAME takes whole frames of this many samples most readily.
const MP3_FRAME = 1152

const pcm16 = (samples: Float32Array) =>
  Int16Array.from(samples, (sample) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    return Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff)
  })

export const encodeMp3 = (
  channels: Float32Array[],
  sampleRate: number,
  bitrate: number,
  onProgress: (done: number) => void = () => {},
): Uint8Array<ArrayBuffer> => {
  const encoder = new Mp3Encoder(channels.length, sampleRate, bitrate)
  const pcm = channels.map(pcm16)
  const length = pcm[0].length
  // a chunk of frames at a time, so progress can be told as it goes
  const chunk = MP3_FRAME * 64
  const parts: Uint8Array[] = []
  for (let from = 0; from < length; from += chunk) {
    const to = Math.min(length, from + chunk)
    const [left, right] = pcm.map((samples) => samples.subarray(from, to))
    parts.push(encoder.encodeBuffer(left, right))
    onProgress(to / length)
  }
  parts.push(encoder.flush())
  const bytes = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}
