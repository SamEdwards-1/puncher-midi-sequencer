import {
  JumpJSON,
  ModOutJSON,
  ModSource,
  PatchJSON,
  PatternStepJSON,
  StepJSON,
  VoiceJSON,
} from "./types"

export const createDefaultJump = (): JumpJSON => ({
  rule: { kind: "always" },
  dest: null,
  normal: null,
})

export const createDefaultStep = (): StepJSON => ({
  notes: [],
  ccs: [],
  state: "normal",
  jump: createDefaultJump(),
})

export const createDefaultPatternStep = (): PatternStepJSON => ({
  on: true,
  articulation: "none",
  accent: "none",
  ratchet: 1,
  probability: 100,
  condition: "always",
})

export const createDefaultVoice = (index: number): VoiceJSON => ({
  enabled: index === 0,
  pace: "8th",
  length: 0.5,
  rule: "nth",
  offset: 0,
  patternLength: 16,
  pattern: Array.from({ length: 16 }, createDefaultPatternStep),
  velocity: 64,
  channel: index + 1,
  program: 0,
})

const MOD_SOURCES: ModSource[] = [
  "seqX",
  "seqY",
  "phase",
  "actionOr",
  "voice1Random",
  "voice2Random",
  "voice3Random",
  "voice4Random",
]

export const createDefaultModOuts = (): ModOutJSON[] =>
  MOD_SOURCES.map((source, index) => ({
    source,
    enabled: false,
    // start above the common controllers to avoid surprising a synth
    cc: 20 + index,
    min: 0,
    max: 127,
    smoothing: 0,
  }))

export const createDefaultPatch = (): PatchJSON => ({
  version: 1,
  name: "",
  size: "large",
  loop: { mode: "recorded", end: 15 },
  syncVoices: false,
  pace: "8th",
  direction: "fwd",
  shiftAmt: 12,
  tempo: 120,
  steps: Array.from({ length: 64 }, createDefaultStep),
  voices: Array.from({ length: 4 }, (_, index) => createDefaultVoice(index)),
  modOuts: createDefaultModOuts(),
})
