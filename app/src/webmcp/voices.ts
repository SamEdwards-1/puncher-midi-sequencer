import {
  createDefaultPatternStep,
  freeVoiceChannel,
  MAX_PATTERN_LENGTH,
  PatchJSON,
  PatternStepJSON,
  setPatternStep,
  setVoice,
  typedVelocityToDot,
  VoiceIndex,
  VoiceJSON,
} from "@midiseq/core"
import { BUILTIN_OUTPUT } from "../stores/MIDIDeviceStore"
import { describeVoice } from "./describe"
import {
  ACCENT_NAMES,
  ARTICULATION_NAMES,
  CONDITION_NAMES,
  FIT_NAMES,
  InputError,
  PACE_NAMES,
  PROBABILITIES,
  RULE_NAMES,
  readAccent,
  readArticulation,
  readBoolean,
  readCondition,
  readFields,
  readFit,
  readInstrument,
  readList,
  readNumber,
  readPace,
  readPattern,
  readProbability,
  readRatchet,
  readRule,
  readVoice,
} from "./input"
import {
  boolean,
  changesAny,
  FIT_HINT,
  fieldsOf,
  integer,
  list,
  named,
  object,
  oneOf,
  PACE_HINT,
  present,
  ToolContext,
  text,
  tool,
} from "./tool"

const DOT = object(
  {
    dot: integer(
      "The dot's number in the pattern, from 1",
      1,
      MAX_PATTERN_LENGTH,
    ),
    on: boolean("Whether it plays or rests"),
    articulation: oneOf(
      ARTICULATION_NAMES,
      "hold carries the note through the dot with no new note; tie overlaps it into the next",
    ),
    accent: oneOf(
      ACCENT_NAMES,
      "Louder (+) or softer (-) than the voice's velocity, by the accent amount in Settings → General. Clears a velocity of its own",
    ),
    velocity: integer(
      "The velocity it plays at, exactly; an accent only where that lands on one",
      1,
      127,
    ),
    ratchet: integer("How many times the note hits within the dot", 1, 4),
    probability: {
      type: "integer",
      enum: PROBABILITIES,
      description: "The chance, in percent, that it plays",
    },
    condition: oneOf(
      CONDITION_NAMES,
      "The visits it plays on: 2:2 to 4:4, the last of every 2 to 4; 1x to 3x, that many, then one off; last and not last, when the voice's dot before it played or didn't",
    ),
    reset: boolean(
      "Returns its options to a plain dot's first, leaving it on or off",
    ),
  },
  ["dot"],
)

const VOICE = object(
  {
    voice: integer("The voice's number, 1 to 4", 1, 4),
    enabled: boolean("Whether it plays"),
    pace: oneOf(
      PACE_NAMES,
      `How often it plays a dot of its pattern. ${PACE_HINT}`,
    ),
    length: integer(
      "How long each note lasts, as a percentage of the voice's pace, in steps of 5",
      10,
      100,
    ),
    rule: oneOf(
      RULE_NAMES,
      "Which of the step's notes it plays: nth, voice N the Nth from the bottom; lowest; highest; random; up and down run through them; updown and downup bounce between the ends, updown+ and downup+ playing the ends twice; rise goes up 2 and down 1, fall down 2 and up 1; outsidein and insideout alternate from the ends or middle; ends alternates the lowest and highest; shuffle plays every note once per random order; walk moves to a neighboring note; norepeat picks randomly without repeating the previous note",
    ),
    offset: integer("Semitones its notes are moved by", -24, 24),
    offset_fit: oneOf(FIT_NAMES, FIT_HINT),
    velocity: integer("How hard it plays", 1, 127),
    channel: integer(
      "The MIDI channel it plays on. No two voices share one: a channel another voice has moves it on to the next free one",
      1,
      16,
    ),
    instrument: text(
      'The General MIDI instrument the built-in synth plays it with, by name ("Electric Bass (finger)", or enough of one to tell it apart) or number, 1 to 128',
    ),
    pattern: text(
      'Its rhythm, a character a dot: x plays, . rests — "x..x..x." is 8 dots. Sets how many dots the pattern has too, up to 16; the dots\' options stay',
    ),
    pattern_length: integer(
      "How many of its dots the pattern plays, leaving the dots as they are",
      1,
      MAX_PATTERN_LENGTH,
    ),
    dots: list(DOT, "Dots to change, each by number"),
  },
  ["voice"],
)

// A dot's options as given, over what it has. An accent picked is exactly
// that accent, and a velocity exactly that velocity, as in a dot's options.
const editDot = (
  start: PatternStepJSON,
  fields: Record<string, unknown>,
  voiceVelocity: number,
  accentAmount: number,
  where: string,
): PatternStepJSON => {
  let dot = start
  if (present(fields.reset) && readBoolean(fields.reset, `${where}.reset`)) {
    dot = { ...createDefaultPatternStep(), on: dot.on }
  }
  if (present(fields.on)) {
    dot = { ...dot, on: readBoolean(fields.on, `${where}.on`) }
  }
  if (present(fields.articulation)) {
    dot = {
      ...dot,
      articulation: readArticulation(
        fields.articulation,
        `${where}.articulation`,
      ),
    }
  }
  if (present(fields.ratchet)) {
    dot = { ...dot, ratchet: readRatchet(fields.ratchet, `${where}.ratchet`) }
  }
  if (present(fields.probability)) {
    dot = {
      ...dot,
      probability: readProbability(fields.probability, `${where}.probability`),
    }
  }
  if (present(fields.condition)) {
    dot = {
      ...dot,
      condition: readCondition(fields.condition, `${where}.condition`),
    }
  }
  if (present(fields.accent)) {
    dot = {
      ...dot,
      accent: readAccent(fields.accent, `${where}.accent`),
      velocityOffset: 0,
    }
  }
  if (present(fields.velocity)) {
    dot = {
      ...dot,
      ...typedVelocityToDot(
        voiceVelocity,
        accentAmount,
        readNumber(fields.velocity, `${where}.velocity`, 1, 127),
      ),
    }
  }
  return dot
}

/**
 * Settings, patterns and dots, for as many voices as the agent likes in one
 * go: all of it one undo, or none of it if any can't be done.
 */
export const voicesTool = ({ stores, view, edit }: ToolContext) => {
  const { sequencerStore, player, playbackSettings, midiDeviceStore } = stores

  const editDots = (
    start: PatchJSON,
    voice: VoiceIndex,
    value: unknown,
    where: string,
  ): { patch: PatchJSON; dots: number[] } => {
    let patch = start
    const dots: number[] = []
    readList(value, where).forEach((item, position) => {
      const at = `${where}[${position}]`
      const fields = readFields(item, at, fieldsOf(DOT))
      const index =
        readNumber(fields.dot, `${at}.dot`, 1, MAX_PATTERN_LENGTH) - 1
      if (!changesAny(fields, DOT, "dot")) {
        throw new InputError(
          `${at} changes nothing: give what to change about dot ${index + 1}`,
        )
      }
      const own = patch.voices[voice]
      patch = setPatternStep(
        patch,
        voice,
        index,
        editDot(
          own.pattern[index],
          fields,
          own.velocity,
          playbackSettings.accentAmount,
          at,
        ),
      )
      dots.push(index)
    })
    return { patch, dots }
  }

  const editVoice = (
    start: PatchJSON,
    value: unknown,
    where: string,
    warnings: string[],
  ): { patch: PatchJSON; voice: VoiceIndex } => {
    let patch = start
    const fields = readFields(value, where, fieldsOf(VOICE))
    const voice = readVoice(fields.voice, `${where}.voice`)
    if (!changesAny(fields, VOICE, "voice")) {
      throw new InputError(
        `${where} changes nothing: give what to change about voice ${voice + 1}`,
      )
    }

    const changes: Partial<VoiceJSON> = {}
    if (present(fields.enabled)) {
      changes.enabled = readBoolean(fields.enabled, `${where}.enabled`)
    }
    if (present(fields.pace)) {
      changes.pace = readPace(fields.pace, `${where}.pace`)
    }
    // on the slider's steps, which are the lengths a modulation reaches
    if (present(fields.length)) {
      const percent = readNumber(
        fields.length,
        `${where}.length`,
        10,
        100,
        false,
      )
      changes.length = (Math.round(percent / 5) * 5) / 100
    }
    if (present(fields.rule)) {
      changes.rule = readRule(fields.rule, `${where}.rule`)
    }
    if (present(fields.offset)) {
      changes.offset = readNumber(fields.offset, `${where}.offset`, -24, 24)
    }
    if (present(fields.offset_fit)) {
      changes.offsetFit = readFit(fields.offset_fit, `${where}.offset_fit`)
    }
    if (present(fields.velocity)) {
      changes.velocity = readNumber(
        fields.velocity,
        `${where}.velocity`,
        1,
        127,
      )
    }
    if (present(fields.instrument)) {
      changes.program = readInstrument(fields.instrument, `${where}.instrument`)
      const { all, voices } = midiDeviceStore.outputNames
      if (!all.includes(BUILTIN_OUTPUT) && voices[voice] !== BUILTIN_OUTPUT) {
        warnings.push(
          `Voice ${voice + 1}'s instrument is heard only through the built-in synth, which isn't one of its outputs`,
        )
      }
    }
    patch = setVoice(patch, voice, changes)

    if (present(fields.channel)) {
      const wanted = readNumber(fields.channel, `${where}.channel`, 1, 16)
      // the next free one on in the direction it was moved, or none
      const channel = freeVoiceChannel(patch, voice, wanted)
      if (channel !== wanted) {
        const other = patch.voices.findIndex(
          (each, index) => index !== voice && each.channel === wanted,
        )
        const moved =
          channel === patch.voices[voice].channel
            ? `stays on channel ${channel}`
            : `went on to channel ${channel}`
        warnings.push(
          `Voice ${voice + 1} ${moved}, as channel ${wanted} is voice ${other + 1}'s and no two voices share one`,
        )
      }
      patch = setVoice(patch, voice, { channel })
    }
    if (present(fields.pattern)) {
      const dots = readPattern(fields.pattern, `${where}.pattern`)
      patch = setVoice(patch, voice, {
        patternLength: dots.length,
        pattern: patch.voices[voice].pattern.map((dot, index) =>
          index < dots.length ? { ...dot, on: dots[index] } : dot,
        ),
      })
    }
    if (present(fields.pattern_length)) {
      patch = setVoice(patch, voice, {
        patternLength: readNumber(
          fields.pattern_length,
          `${where}.pattern_length`,
          1,
          MAX_PATTERN_LENGTH,
        ),
      })
    }
    if (present(fields.dots)) {
      const done = editDots(patch, voice, fields.dots, `${where}.dots`)
      patch = done.patch
      const { patternLength } = patch.voices[voice]
      const past = done.dots.filter((dot) => dot >= patternLength)
      if (past.length > 0) {
        warnings.push(
          `Voice ${voice + 1}'s pattern plays ${patternLength} dots, so ${named("dot", past)} won't play until it is longer`,
        )
      }
    }
    return { patch, voice }
  }

  return tool({
    name: "set_voices",
    title: "Change voices",
    description:
      "Changes voices: their settings, rhythm patterns and dots. List each voice by number, 1 to 4, with only what should change; the whole call is one entry in the app's undo history, and nothing changes if any of it can't be done. A voice plays a dot of its pattern at every beat of its pace, looping the pattern, and each time picks a note by its rule from whatever step is current, moved by its offset. The first voice changed is shown in the Voices panel, which also makes it the voice Sync plays. Returns the voices as they now are.",
    input: object({ voices: list(VOICE, "The voices to change") }, ["voices"]),
    run: (input) => {
      const warnings: string[] = []
      let patch = sequencerStore.patch
      const edited: VoiceIndex[] = []
      readList(input.voices, "voices").forEach((entry, position) => {
        const done = editVoice(patch, entry, `voices[${position}]`, warnings)
        patch = done.patch
        if (!edited.includes(done.voice)) {
          edited.push(done.voice)
        }
      })
      if (edited.length === 0) {
        throw new InputError("voices lists no voices to change")
      }
      edit(patch)
      // shown as a click on its tab shows it, which Sync follows
      view.selectVoice(edited[0])
      player.setSelectedVoice(edited[0])
      return {
        voices: edited.map((voice) =>
          describeVoice(patch, voice, playbackSettings.accentAmount),
        ),
        ...(warnings.length > 0 && { warnings }),
      }
    },
  })
}
