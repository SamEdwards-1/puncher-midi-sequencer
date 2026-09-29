# WebMCP in Puncher

Puncher offers itself to AI agents in the browser through WebMCP. An agent can
read the sequence and change it while you watch: the steps, the voices, the
sequencer's settings, modulations, the transport, recording and the actions.
Everything it changes shows in the UI as it lands, and **Edit → Undo** takes
it back.

It came in with PR #50 (branch `webmcp`, merged 2026-09-28). Recording,
modulations and the step menu's actions followed on the same branch.
README → Agents covers it for users, and PLAN §5.7 has the design notes.

## What WebMCP is

WebMCP is a draft web API from the W3C Web Machine Learning Community Group
(<https://webmachinelearning.github.io/webmcp/>). A page registers **tools** on
`document.modelContext`, and an agent in the browser finds and calls them.
Each tool has a name, a description, a JSON Schema for its input and an
`execute` function. It is MCP, but the tools run inside the page. They act on
the page's live state, in your own session, and what they change shows at once.

The API as Puncher uses it:

```js
await document.modelContext.registerTool(
  { name, title, description, inputSchema, execute, annotations },
  { signal },
)
```

- Aborting `signal` takes the tool away again. The API has no `unregisterTool`.
- Registering a name that's already taken rejects with `InvalidStateError`.
- `execute(input)` gets the input as an object, and what it returns reaches
  the agent as JSON.
- The browser **doesn't check input against `inputSchema`**. When `execute`
  throws, the agent gets a bare `UnknownError` and never sees the message.
  So Puncher checks every input itself, and returns problems as
  `{ "error": "…" }` values the agent can read and act on.
- `navigator.modelContext` was the API's old home. Chrome 150 deprecated it
  and Chrome 153 removed it. Puncher only looks at `document.modelContext`.

## Turning it on

No browser has WebMCP on by default yet.

- **Locally (Chrome 150 or later):** open
  `chrome://flags/#enable-webmcp-testing` ("WebMCP for testing"), set it to
  Enabled, and relaunch. That's all localhost needs.
- **A deployed site:** Chrome runs an origin trial for Chrome 149 to 156,
  ending 2026-11-16. Register the site's origin at
  <https://developer.chrome.com/origintrials>, then serve the token as an
  `Origin-Trial` header or a `<meta http-equiv="origin-trial" content="…">`
  tag. Puncher has no token yet.

In a browser without WebMCP, `document.modelContext` isn't there, so Puncher
offers nothing and nothing changes.

## Trying it

1. Run `npm start`, then open <http://localhost:3000> (or the next free port
   it prints) in Chrome with the flag on.
2. Install **Model Context Tool Inspector**
   ([Chrome Web Store](https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd),
   [source](https://github.com/beaufortfrancois/model-context-tool-inspector)).
   Click its icon to open the side panel. It lists Puncher's fourteen tools
   with their schemas, and runs any of them with JSON you type. Its README
   says it can also hand them to Gemini to call.
3. Run `get_sequence` with `{}`. Then try the edits under
   [A worked example](#a-worked-example) and watch the grid, the step editor
   and the Voices panel follow.

To hear anything, tick an output in **Settings → MIDI**. If it's the built-in
synth, click anywhere on the page once. Browsers only start audio after a
click or key press, and an agent's call doesn't count. `play` and
`get_sequence` say so whenever nothing would be heard.

With the testing flag on, the page's model context also has the agent's
side. That's what the inspector calls, so the console can call it too. This
hasn't been tried here; if these methods aren't in your Chrome, use the
extension.

```js
const tools = await document.modelContext.getTools()
tools.map((tool) => tool.name)
const call = (name, input = {}) =>
  document.modelContext.executeTool(tools.find((tool) => tool.name === name), input)
await call("get_sequence")
await call("set_sequencer", { tempo: 96 })
```

## The tools

| Tool | Does | Undo |
|---|---|---|
| `get_sequence` | reads it all: settings, voices and patterns, every step holding anything, the scales the notes suggest, modulations, the transport, the selection, whether there's anything to undo | read-only |
| `set_steps` | notes, transposing, rests and skips, jumps and CC envelopes, on any number of steps | one entry a call |
| `set_voices` | voice settings, patterns and dot options, on any number of voices | one entry a call |
| `set_sequencer` | tempo, size, pace, direction, loop, scale and the rest of the Sequencer panel | one entry a call |
| `set_modulations` | binds settings to CCs, as a setting's gear does, so the steps' envelopes drive them | one entry a call |
| `step_menu` | what right-clicking a step offers: copy, paste, insert before or after, clear, delete | one entry a change |
| `play`, `stop` | the transport | — |
| `set_recording` | the Record button, and where recording goes | a take is one entry |
| `set_actions` | Hold, Sync, Flip and Shift, each on until turned off, and the voice Sync plays | not saved or undone, like the buttons |
| `select_step` | what clicking a step in the grid does: shows it, sounds it, plays it next | — |
| `undo`, `redo` | **Edit → Undo** and **Redo**, 1 to 50 times | — |
| `clear_sequence` | empties every step and resets the voices; tempo, size, pace, direction and loop stay | one entry |

**Not offered:**
- saving, opening and exporting, since a file picker needs a person's click
- the Settings dialog: outputs, the MIDI input, themes and SoundFont
- playing into a recording: an agent can start one, but only the person can
  play into it

## How it behaves

- **Edits work like the UI's.** Each edit builds the new patch from
  `@midiseq/core`'s commands, pushes the old one onto the undo history, then
  sets it. A call is one undo entry however much it changes, and a call that
  changes nothing leaves no entry. The first step or voice edited is
  selected, so you see the change land. A voice edited also becomes the one
  Sync plays, as clicking its tab would make it.
- **All or nothing.** If any part of a call can't be done, nothing changes,
  and the call returns an `error` saying what to fix. For example:
  `steps[1]: a step plays at most 4 notes, one for each voice, and 5 were given`.
- **Strict.** Unknown fields are refused rather than ignored, for example
  `steps[0] has no field "note"; it takes step, clear, notes, transpose, state, jump, envelopes`.
  `null` counts as left out, since some agents send every field. Numbers and
  true/false may come as text, and input sent as a string is parsed as JSON.
- **Named as the app shows things.** Steps, voices and dots count from 1.
  Notes are scientific pitch names ("C4" is middle C, "F#3", "Bb2", "E♭4")
  or MIDI numbers. Paces, rules, directions and scales take the app's label
  or the stored id, such as "16th T" or "16thT", "Up / Down" or "updown",
  "A minor". Case and spacing don't matter.
- **Warnings.** Things that worked but may surprise come back as `warnings`:
  - envelope points past the step's end
  - notes past Step Notes
  - steps outside a custom loop
  - a channel another voice has (the voice moves on to a free one)
  - an instrument only the built-in synth plays, when it isn't an output
  - envelopes already on a CC that a new modulation takes, which start
    driving the setting
  - a step an insert pushes past the grid's end, or off the end of the patch
  - jumps a delete drops
  - recording with no MIDI input to hear
- **Takes end first.** Clearing, inserting or deleting steps ends a
  recording take first, as the app's own controls do, so the take and the
  change are two undo entries.
- **Why it's silent.** `play`, `select_step` and `get_sequence` report
  when nothing would be heard: nothing routed, the built-in synth still
  loading or failed, or waiting for a click (`SynthStore.waiting`).
- **Untrusted content.** `get_sequence` is annotated `readOnlyHint` and
  `untrustedContentHint`, since a patch or file name can come from any file.

## Tool reference

Each tool's schema tells the agent all of this in its descriptions. This is
the short version.

### get_sequence

No input. Returns:

- `name`, `file`, `unsaved`
- `sequencer`: tempo, size, columns, pace, step_beats, direction, loop,
  loop_end, sync_voices, shift, shift_fit, step_notes, scale
- `detected_scales`: the scales the notes suggest, most likely first
- `voices`: voice, enabled, pace, length (%), rule, offset, offset_fit,
  velocity, channel, instrument, pattern (`"x..x"`), and `dots` with the
  options of the dots that have any
- `steps`: only those holding something, each with its notes, state, jump
  and envelopes. Also `unplayed_notes`, `outside_scale`, and `beats` where
  a modulation changes the step's length. An envelope on a modulated CC
  says what it `modulates`, and each point what it `stands_for`.
- `kept_past_size`: steps past the grid's size that still hold something
- `modulations`: each setting a CC drives, as `set_modulations` names it
  (`setting`, and `voice` for a voice's), its `label`, `cc`, `from` and
  `to`, the CC value standing for each of its `values`, and the `steps`
  with an envelope for it
- `accent_amount`: how far an accent moves the velocity, from Settings
- `transport`: playing, step, recording, record_step, actions, outputs,
  voice_outputs, the MIDI `inputs` recording hears, and `sound` when
  nothing would be heard
- `selected`: step and voice
- `can_undo`, `can_redo`

### set_steps

`{ "steps": [ { "step": 1, …what changes… } ] }`

| Field | Takes |
|---|---|
| `step` | 1 to the grid's size |
| `notes` | a list or `"C4 E4 G4"`. Replaces the step's notes, and `[]` leaves none. At most Step Notes of them (4 unless lowered) |
| `transpose` | semitones, applied after `notes` |
| `state` | `normal`, `rest` (visited but silent; envelopes still go out) or `skip` (never visited) |
| `jump` | `{ rule, destination, normal, remove }`. See below |
| `envelopes` | `[ { cc, channel, points, shape, remove } ]`. See below |
| `clear` | empties the notes and envelopes first, like the step editor's Clear (which also ends a take) |

- **Jump rules:** `always`; `1x` to `7x`, which jump that many times and
  then fall through once; `2:2` to `8:8`, on the last of every 2 to 8
  visits; `10%`, `25%`, `33%`, `50%`, `67%`, `75%` or `90%`; `last` or
  `not last`, whether the last jump anywhere was taken.
- **Jump targets:** `destination: null` means no jump target, and
  `normal: null` means the next step in the sequencer's direction.
- **Envelopes:** `cc` is 0 to 119, and `channel` is 1 unless given.
  - `points` are `{ beat, value }`, counted from the step's start, and
    replace any the envelope had. Two points at one beat make a jump.
  - `shape` is `steps` (holds each value, as a knob does) or `ramps`
    (straight lines between points). A new envelope uses `steps` unless
    given.
  - On a CC that drives a modulation, values snap to the setting's values.
    Taking away the last envelope on such a CC takes the modulation away
    too, as the envelope editor does.
  - An envelope is found by its CC and channel, so giving one that exists
    changes it, and `remove: true` takes it away.

### set_voices

`{ "voices": [ { "voice": 1, …what changes… } ] }`

| Field | Takes |
|---|---|
| `voice` | 1 to 4 |
| `enabled` | true or false. The voice's mute and solo buttons switch this too (PR #55) |
| `pace` | how often it plays a dot. See paces below |
| `length` | note length, 10 to 100 % of its pace, rounded to 5 |
| `rule` | `nth`, `lowest`, `highest`, `random`, `up`, `down`, `updown`, `downup`, `updown+`, `downup+`, `rise`, `fall` (or labels such as "Up / Down") |
| `offset`, `offset_fit` | −24 to 24 semitones; `up`, `down`, `exclude` or `ignore` for notes moved out of the scale |
| `velocity` | 1 to 127 |
| `channel` | 1 to 16. No two voices share one: a channel already taken moves the voice on to the next free one, with a warning |
| `instrument` | a General MIDI name, or enough of one to be unique ("vibraphone"), or 1 to 128. Only the built-in synth plays it |
| `pattern` | `"x..x x.x."`: `x` plays and `.` rests, 1 to 16 dots. It sets the pattern's length too, and each dot keeps its options |
| `pattern_length` | how many of the dots play, with the dots left as they are |
| `dots` | `[ { dot, on, articulation, accent, velocity, ratchet, probability, condition, reset } ]`. See below |

- **Dot options:**
  - `articulation`: `none`, `hold` or `tie`
  - `accent`: `none`, `+` or `-`
  - `velocity`: 1 to 127, exact
  - `ratchet`: 1 to 4
  - `probability`: 100, 90, 75, 67, 50, 33, 25 or 10
  - `condition`: `always`, `2:2`, `3:3`, `4:4`, `1x`, `2x`, `3x`, `last` or
    `not last`
  - `reset: true`: back to a plain dot, keeping on or off

### set_sequencer

Give any of these:

| Field | Takes |
|---|---|
| `tempo` | 20 to 400, rounded to whole beats per minute |
| `size` | 1 to 64. Steps past it keep what they hold |
| `pace` | see paces below |
| `direction` | `fwd`, `bwd`, `fwdbwd`, `bwdfwd`, `random` or `random+` |
| `loop`, `loop_end` | `recorded`, `all` or `custom`. Giving `loop_end` makes it custom |
| `sync_voices` | whether every voice restarts its pattern on each step |
| `shift`, `shift_fit` | the Shift action's semitones (−24 to 24) and its fit |
| `step_notes` | 1 to 4, how many of a step's notes play, lowest first |
| `scale` | `"A minor"`, `"F# dorian"` or `"none"`. The scales are major, minor, dorian, phrygian, lydian, mixolydian, harmonic minor, major pentatonic, minor pentatonic and minor blues. Notes outside the scale are only marked |
| `name` | the patch's name |

**Paces,** slowest first as the pace fields list them: `16bar`, `8bar`,
`4bar`, `2bar`, `1bar`, `2ndD`, `2nd`, `4thD`, `2ndT`, `4th`, `8thD`,
`4thT`, `8th`, `16thD`, `8thT`, `16th`, `32ndD`, `16thT`, `32nd`, `32ndT`.
`D` is dotted and `T` triplet, and the labels ("16th T", "Half D",
"1 Bar") work too. A new patch steps at `8th`, half a beat per step.

### set_modulations

A modulation lets a CC drive a setting. On a step with an envelope for that
CC, the setting follows the envelope across the step; on a step without one,
the setting keeps its own value.

`{ "modulations": [ { "setting": "pace", "voice": 2, …what changes… } ] }`

| Field | Takes |
|---|---|
| `setting` | a voice's `pace`, `length`, `rule`, `offset`, `offset_fit`, `pattern_length` or `sync`; the sequencer's `pace`, `scale` or `shift_fit`; or the `hold`, `flip` or `shift` action |
| `voice` | 1 to 4, for a voice's settings and `sync`. Without it, `pace` is the sequencer's |
| `cc` | 0 to 119, one no other modulation has. A new modulation takes the first undefined controller nothing uses, unless given |
| `from`, `to` | the setting's values the CC's 0 and 127 stand for, as its field has them: a pace (`"16th"`), a length in percent (`35`), a rule, semitones (`-7`), a fit, a pattern length, a scale (`"A minor"` or `"none"`), or `on`/`off` for an action. A new modulation spans every value unless given; for the scale, the ten scales at its tonic |
| `remove` | `true` stops the CC driving the setting. Its envelopes stay, as plain CCs |

- The values from `from` to `to` spread evenly over CC 0 to 127, in the
  order the setting's field lists them, and backwards when `from` comes
  after `to`.
- Each modulation returned lists its `values`, each with the CC value that
  stands for it: what an envelope point sends to set the setting there.
  Draw the envelopes with `set_steps`.
- A setting has at most one modulation, and a CC drives one setting.
- The first voice whose setting is modulated is shown in the Voices panel,
  where its gear is, as `set_voices` shows the voice it changes.
- Changing a modulation's CC or range takes its envelopes along, so each
  step plays as it did wherever it can.
- A CC that steps already have envelopes for starts driving the setting on
  them, with a warning.
- `clear_sequence` takes the voices' modulations away with the voices, and
  keeps the sequencer's and the actions'.

### step_menu

`{ "step": 3, "action": "insert_before" }`: one step and one action, as the
menu is one click. The menu's own wording works too ("Insert before").

- `copy` keeps the step — notes, envelopes, state and jump — in the app's
  own copy, which the step editor and the grid's menu paste too. It changes
  nothing.
- `paste` puts the step copied last onto this one, in place of what it held.
- `insert_before` and `insert_after` put an empty step there. The steps
  from there on move along one, and jumps and a custom loop's end follow
  them. Steps pushed past the grid's size are kept beyond it; step 64, the
  last a patch keeps, falls off the end. There is no `insert_after` on the
  grid's last step, where the room would be out of sight.
- `clear` empties the step's notes and envelopes, like `set_steps` `clear`.
- `delete` takes the step out. The steps after it move back one, an empty
  step comes in at the end, and jumps to the deleted step are dropped.

The step is selected, as a right-click selects it; after an insert, the new
empty step is. Each change is one undo entry.

### set_recording

`{ "recording": true, "step": 1 }`, either or both.

- `recording` starts or ends a take, as the Record button does. A take is
  one undo entry.
- `step` is where recording goes next, and gets selected, as clicking it
  would.
- Recording writes what the person plays on the MIDI input. Notes land on
  the record step, fitted to the scale, the first of a take replacing what
  the step held. Once the step holds Step Notes of them, recording moves on
  to the next. A knob or fader records into the step's envelope for its CC,
  and while the sequence plays, it records where it is heard.
- It returns `recording`, `record_step` and the MIDI `inputs` it hears
  (ticked in Settings → MIDI and connected), with a warning when there are
  none.

### The rest

- **`play`, `stop`:** no input. `play` starts from the start.
- **`set_actions`:** any of `hold`, `sync`, `flip` and `shift` (true or
  false), and `sync_voice` (1 to 4).
- **`select_step`:** `{ step, audition }`. It shows the step in the step
  editor. It sounds the step if `audition` is true; when `audition` isn't
  given, the **Audition step** toggle decides. While playing, it queues the
  step to play next. Otherwise, including while recording, it moves where
  the recording goes.
- **`undo`, `redo`:** `{ times }`, 1 to 50, 1 unless given. These undo your
  own changes as well as the agent's.
- **`clear_sequence`:** no input. One undo brings it all back.

## A worked example

Suppose you ask an agent: *"Make a four-chord loop in A minor with a bass on
voice 1 and an arpeggio on voice 2, then play it."* A good agent calls
`get_sequence` first, then something like this.

`set_sequencer`, for one bar a step:

```json
{ "tempo": 96, "pace": "1bar", "scale": "A minor" }
```

`set_steps`, for the chords, a 50% chance of going back to the top after
step 3, and a filter sweep across step 4 (beats 0 to 4 fill a 1-bar step):

```json
{
  "steps": [
    { "step": 1, "notes": "A2 C4 E4 A4" },
    { "step": 2, "notes": ["F2", "A3", "C4", "F4"] },
    { "step": 3, "notes": "C3 E4 G4 C5", "jump": { "rule": "50%", "destination": 1 } },
    {
      "step": 4,
      "notes": "G2 B3 D4 G4",
      "envelopes": [
        { "cc": 74, "shape": "ramps",
          "points": [ { "beat": 0, "value": 30 }, { "beat": 4, "value": 110 } ] }
      ]
    }
  ]
}
```

`set_voices`, for a bass that plays the lowest note and an arpeggio up and
down through the chord:

```json
{
  "voices": [
    { "voice": 1, "rule": "lowest", "pace": "4th", "pattern": "x.xx",
      "instrument": "Electric Bass (finger)" },
    { "voice": 2, "enabled": true, "rule": "Up / Down", "pace": "16th",
      "pattern": "xxxx xxx.",
      "dots": [ { "dot": 1, "accent": "+" }, { "dot": 7, "ratchet": 2, "probability": 50 } ] }
  ]
}
```

Then `play` with `{}`. It says if nothing would be heard, for example when
the built-in synth is waiting for a click.

*"Have the arpeggio double its speed halfway through the last chord."*
`set_modulations` lets CC 20 drive voice 2's pace, from eighths to 32nds:

```json
{ "modulations": [ { "setting": "pace", "voice": 2, "cc": 20, "from": "8th", "to": "32nd" } ] }
```

Its `values` put 16ths at CC 64 and 32nds at 127, so `set_steps` gives
step 4 an envelope holding 64 for two beats, then 127:

```json
{
  "steps": [
    { "step": 4,
      "envelopes": [ { "cc": 20, "points": [ { "beat": 0, "value": 64 }, { "beat": 2, "value": 127 } ] } ] }
  ]
}
```

Each edit call is its own undo entry, so **Edit → Undo** takes it back a call
at a time.

## The code

| File | Holds |
|---|---|
| `app/src/webmcp/modelContext.ts` | the WebMCP types; `modelContextOf(document)`; `registerTools(context, tools, signal)`, which logs a refused tool rather than failing the rest. The only code that knows the browser's API |
| `app/src/webmcp/tools.ts` | `createTools(stores, view)`: `edit()`, which makes an undo entry and skips no-ops; `get_sequence`, `play`, `stop`, `set_actions`, `select_step`, `undo`, `redo` and `clear_sequence` |
| `app/src/webmcp/steps.ts`, `voices.ts`, `sequencer.ts` | `set_steps`, `set_voices` and `set_sequencer` |
| `app/src/webmcp/modulations.ts`, `stepMenu.ts`, `recording.ts` | `set_modulations`, `step_menu` and `set_recording` |
| `app/src/webmcp/tool.ts` | the `tool()` wrapper, which parses input, refuses unknown fields and turns errors into `{ error }`; the JSON Schema builders; `ToolView` and `ToolContext` |
| `app/src/webmcp/input.ts` | reads and checks every kind of input, with the messages agents see |
| `app/src/webmcp/describe.ts` | the patch as agents read it, and `soundStatus` |
| `app/src/hooks/useWebMCP.ts` | registers the tools while the editor is mounted |
| `app/src/hooks/useSequencerView.ts` | `useSelectionAccess()`, which reads and sets the selected step and voice, and the copied step, through the jotai store without re-rendering |
| `app/src/components/RootView/RootView.tsx` | calls `useWebMCP()` |
| `app/src/stores/SynthStore.ts` | `waiting`, true while the built-in synth's audio is held back until a click |

`useWebMCP` makes an `AbortController` on mount and registers every tool with
its signal. On unmount it aborts, which takes them all away. That way React
StrictMode's double mount and Vite's hot reloads never register a name twice.
The tools read the stores and the selection when they're called, not when
they're registered, so they always see the current patch.

### Adding a tool

1. Describe its input with the builders in `tool.ts` (`object`, `integer`,
   `oneOf`, `list` and so on). They produce plain JSON Schema with
   `additionalProperties: false`.
2. Write it as `tool({ name, title, description, input, run })`. In `run`,
   read each field with `input.ts`'s readers, which throw `InputError` for
   anything unusable. Build the new patch with core's commands, and call
   `edit(patch)` once.
3. Add it to the list in `createTools`, to README → Agents, and to this file.
4. Test it in `tools.test.ts` against a real `RootStore`.

## Tests

- `app/src/webmcp/tools.test.ts` covers every tool's edits, errors and
  warnings, against a real `RootStore` with a fake view.
- `app/src/webmcp/webmcp.test.tsx` renders the app with a fake
  `document.modelContext`. It covers registering, unregistering on unmount,
  an agent's edit showing in the UI, reading your selection, and pasting
  from the grid's menu a step the agent copied.

Run them with `npm test -w app -- src/webmcp`, or `npm test` for everything.

## Not yet done

- **A real agent.** Nobody has tried it in Chrome with the flag and a real
  agent. So far it has been checked against a fake `document.modelContext`
  that follows the spec, in the tests and in the browser.
- **An origin-trial token**, for a deployed site to offer the tools without
  the flag.
- **API changes.** WebMCP is a draft and has moved once already, from
  `navigator` to `document`. If it moves again, `modelContext.ts` is the
  place to change.
- **Cancelling calls.** The tools ignore the `signal` passed to `execute`.
  Every call finishes at once, so there's nothing to cancel.
