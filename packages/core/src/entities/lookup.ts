import {
  EnvelopeJSON,
  ModulationJSON,
  ModulationTarget,
  VOICE_COUNT,
} from "./types"

// Patch commands replace these arrays rather than mutating them. A weak key
// shares the index across engines/forks without keeping old patches alive.
interface EnvelopeLookup {
  firstByCC: Map<number, EnvelopeJSON>
  hasPoints: boolean
}

const envelopes = new WeakMap<EnvelopeJSON[], EnvelopeLookup>()

export const envelopeLookup = (items: EnvelopeJSON[]): EnvelopeLookup => {
  const known = envelopes.get(items)
  if (known !== undefined) {
    return known
  }
  const firstByCC = new Map<number, EnvelopeJSON>()
  let hasPoints = false
  for (const item of items) {
    if (!firstByCC.has(item.cc)) {
      // An empty first envelope still wins over later ones on other channels.
      firstByCC.set(item.cc, item)
    }
    hasPoints ||= item.points.length > 0
  }
  const found = { firstByCC, hasPoints }
  envelopes.set(items, found)
  return found
}

export const modulationTargetKey = (target: ModulationTarget): string =>
  `${target.kind}:${"voice" in target ? target.voice : ""}:${target.setting}`

interface ModulationLookup {
  firstByCC: Map<number, ModulationJSON>
  firstByTarget: Map<string, ModulationJSON>
  voices: ModulationJSON[][]
  sequencer: ModulationJSON[]
}

const modulations = new WeakMap<ModulationJSON[], ModulationLookup>()

export const modulationLookup = (items: ModulationJSON[]): ModulationLookup => {
  const known = modulations.get(items)
  if (known !== undefined) {
    return known
  }
  const firstByCC = new Map<number, ModulationJSON>()
  const firstByTarget = new Map<string, ModulationJSON>()
  const voices: ModulationJSON[][] = Array.from(
    { length: VOICE_COUNT },
    () => [],
  )
  const sequencer: ModulationJSON[] = []
  for (const item of items) {
    if (!firstByCC.has(item.cc)) {
      firstByCC.set(item.cc, item)
    }
    const key = modulationTargetKey(item.target)
    if (!firstByTarget.has(key)) {
      firstByTarget.set(key, item)
    }
    // Keep list order: if several entries affect one setting, the last
    // nonempty envelope's value wins, as in the original evaluation loop.
    if (item.target.kind === "voice") {
      voices[item.target.voice].push(item)
    } else if (item.target.kind === "sequencer") {
      sequencer.push(item)
    }
  }
  const found = { firstByCC, firstByTarget, voices, sequencer }
  modulations.set(items, found)
  return found
}
