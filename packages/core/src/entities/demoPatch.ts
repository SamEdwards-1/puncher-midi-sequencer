import { createDefaultPatch } from "./defaults"
import { PatchJSON } from "./types"

// A short chord loop that exercises three voices on channels 1-3. It stands in
// for a real patch until patches can be edited and opened in the app.
export const createDemoPatch = (): PatchJSON => {
  const patch = createDefaultPatch()
  patch.name = "Demo"
  patch.pace = "1bar"

  const chords = [
    [57, 60, 64, 67], // Am7
    [53, 57, 60, 64], // Fmaj7
    [48, 52, 55, 60], // C
    [55, 59, 62, 67], // G
  ]
  chords.forEach((notes, index) => {
    patch.steps[index].notes = notes
  })
  // every second pass, Fmaj7 skips straight to G
  patch.steps[1].jump = {
    rule: { kind: "every", n: 2 },
    dest: 3,
    normal: null,
  }

  const [arp, bass, lead, spare] = patch.voices
  patch.voices = [
    {
      ...arp,
      enabled: true,
      pace: "16th",
      length: 0.6,
      rule: "updown",
      velocity: 80,
      channel: 1,
    },
    {
      ...bass,
      enabled: true,
      pace: "8th",
      length: 0.8,
      rule: "lowest",
      offset: -12,
      velocity: 100,
      channel: 2,
      patternLength: 8,
      pattern: bass.pattern.map((dot, index) => ({
        ...dot,
        on: [0, 3, 4, 6].includes(index),
      })),
    },
    {
      ...lead,
      enabled: true,
      pace: "g8th",
      length: 0.4,
      rule: "random",
      offset: 12,
      velocity: 70,
      channel: 3,
      patternLength: 5,
      pattern: lead.pattern.map((dot, index) => ({
        ...dot,
        on: index !== 4,
        probability: index === 2 ? 50 : dot.probability,
      })),
    },
    { ...spare, enabled: false },
  ]
  return patch
}
