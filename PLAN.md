# midiseq — Plan

A browser MIDI step sequencer with decoupled voices and conditional jumps. It
runs in a local browser, talks to system MIDI ports through the Web MIDI API,
and is built to work with [Signal](https://signalmidi.app) (`ryohey/signal`),
whose stack and conventions it follows.

- **Now:** a standalone app that sends MIDI to Signal over loopMIDI ports and
  can follow Signal's MIDI clock.
- **Later:** a top-level tab inside Signal, next to `/track`, `/arrange` and
  `/tempo` (§2.1).
- **Files:** its own `*.midiseq.json` format (§4.3).

---

## 1. Features

The sequencer steps through a grid of polyphonic steps at its own pace. Four
voices read the active step and play from it at their own pace, each with its
own rhythm pattern and note-picking rule. **Jumps** move playback from one step
to another when a condition is met.

### Layout
| Area | Contents |
|---|---|
| Top bar | File, Presets, Mod Outs, Keyboard · Undo/Redo · Clear, Record, Play, Tempo · MIDI devices, Settings |
| Left | Sequencer settings (Size, Loop, Sync Voices, Pace, Direction, Shift Amt, Rest/Skip) and the Jump editor |
| Center | 8×8 or 4×4 step grid, step editor, Hang/Bump/Flip/Shift buttons |
| Right | Voice tabs 1–4 |

### Sequencer
- **Steps** hold up to *Max Notes per Step* notes (setting, default 4, range
  1–16, saved in the file) plus any number of CC events.
  - Lowering the limit never deletes notes; extras are dimmed and ignored until
    "Trim to limit" (undoable).
  - A recorded chord larger than the limit keeps its first N note-ons.
  - A step is `normal`, `rest` (visited, silent) or `skip` (never visited).
- **Size:** Small 4×4 (steps 0–15) or Large 8×8 (0–63).
- **Loop:** `Recorded` (up to the last step with notes, CCs or a rest), `All`,
  or `Custom` (loops back after a chosen step).
- **Pace:** 16 bars down to 32nd triplet.
- **Direction:** Forwards, Backwards, FwdBwd, BwdFwd, Random, Random+ (no
  repeats).
- **Sync Voices:** each advance resets every voice's pattern, rule cursor and
  phase.
- **Shift Amt:** ±24; notes starting while Shift is held are transposed.
- **Queue:** clicking a step while playing makes it the next step.

### Jumps (one per step)
- Destination (or none) and Normal (where to go on failure; default "next").
- Rules: Always · 1x–7x (succeed N times, fail once) · 2:2–8:8 (succeed on the
  Nth visit) · 10–90% · Last · Not Last.

### Voices (×4)
- Enable, Pace (plus six golden-ratio paces, ~1.618× the straight note),
  Length (gate 10–100%), Offset (±24), Velocity, Channel.
- **Rules:** Nth, Lowest, Highest, Random, Up, Down, UpDown, DownUp, UpDown+,
  DownUp+ (ends repeat), Rise (up 2, down 1), Fall (down 2, up 1).
- **Pattern:** 1–16 dots, each on/off with options:
  - Articulation: none / hold (sustain through the dot) / tie (legato overlap)
  - Accent: none / + / − · Ratchet: 1–4 hits · Probability: 10–100%
  - Condition: Always, 2:2, 3:3, 4:4, 1x, 2x, 3x, Last, Not Last
  - Plays only when both probability and condition pass.

### Actions (momentary, optionally latching)
- **Hang:** the step stops advancing; voices keep playing.
- **Bump:** inverts Sync Voices.
- **Flip:** swaps rows and columns.
- **Shift:** transposes new notes by Shift Amt.

### Step editor, recording, undo
- **Step editor:** edit notes by hand (name ⇄ number, transpose ±1/±12) and a
  CC list (cc, value, channel or voice channel, output). CCs fire when the
  sequencer lands on the step, before that beat's notes — including on rests,
  never on skips, and not again while Hang holds. Copy/paste steps.
- **Recording:** from MIDI input, the on-screen keyboard or the computer
  keyboard; chords go into one step; overdub while playing; rest & advance,
  back & clear, octave, and a Clear menu.
- **Undo/redo:** every patch change; a drag or a recording take is one entry.

### Mod Outs (8 CC streams)
Seq X, Seq Y (top is low), Phase (position in loop), Action OR, Voice 1–4
Random. Each has enable, CC#, min/max and smoothing.

### MIDI I/O
- Five outputs: All, plus one per voice, each routed to its own port.
- The All output de-duplicates notes: one note-on for simultaneous identical
  notes, a note-off before a retrigger, and the final note-off only when the
  last voice releases.
- Input port + channel (or omni) for recording. MIDI clock in and out.
- No built-in synth: listen through Signal or other instruments.

---

## 2. Stack & conventions (from Signal)

| Concern | Choice |
|---|---|
| Repo | npm workspaces + Turbo: `app/` and `packages/core` (`@midiseq/core`) |
| Build / test | React 19, TypeScript, Vite 7, Vitest 4 (jsdom), Testing Library |
| Lint / format | Biome with Signal's settings |
| Domain state | MobX stores on a `RootStore`, bridged with `useMobxSelector` / `useMobxGetter` |
| UI state | jotai atoms behind `useXxx()` hooks; settings via `atomWithStorage` (`midiseq.` keys) |
| Mutations & undo | Action hooks call `pushHistory()` then a command; snapshot history in jotai |
| Styling | Emotion + a `Theme` exposed as CSS variables; Radix primitives; `mdi-react` icons |
| i18n | `use-l10n`, keys prefixed `sequencer-` |
| MIDI | Web MIDI store with hot-plug and name-based port memory; `SynthOutput`-style outputs |

**Browsers:** Chrome/Edge fully; Firefox after a permission prompt; Safari has
no Web MIDI. `localhost` is a secure context. Browsers can't create virtual
ports, so Windows needs loopMIDI to reach Signal or a DAW.

### 2.1 Designing for the Signal tab
- One `SequencerEditor` + `SequencerProvider` pair; standalone `RootView` just
  renders it, and in Signal it becomes a `/sequencer` route.
- Services depend on interfaces (`IMIDIDevices`, `IMIDIInput`, `SynthOutput`) so
  Signal's own MIDI stores can be swapped in.
- Namespaced atoms, storage keys, localization keys and view-scoped shortcuts.
- Separate undo history, so sequencer undo never rewinds the song.
- Only theme tokens; new colors are added as Theme fields.
- `ClockSource`: Internal | MIDI Clock In | Host Player (later).

---

## 3. Architecture

```
app/
  components/  SequencerEditor, TopBar, SequencerPanel, SequenceGrid, VoicePanel, ...
  hooks/ actions/ stores/ (RootStore, SequencerStore, MIDIDeviceStore)
  services/    SequencerPlayer, OutputRouter + AllOutDedupe, MIDIOutput/Input,
               MIDIRecorder, ClockIn/Out, AutoSave, IndexedDB, FileService
packages/core/
  entities/    types, paces, defaults, PatchSchema (zod), noteName
  engine/      Engine, direction, loopRange, jumpRules, voiceRules,
               patternConditions, modOuts, rng, runtime, events
  commands/    (milestone 3)   file/ (milestone 8)
```

- **Engine:** pure TypeScript, no MobX. `render(toBeat)` returns timestamped
  events in floating-point beats (so golden paces stay exact); all mutable
  state lives in a runtime object and randomness is seeded.
- **Timing:** the player ticks every 25 ms with ~100 ms lookahead, converts
  beats to `performance.now()` timestamps and calls `port.send(bytes, ts)`.
  The tick comes from a Web Worker, because browsers throttle main-thread
  timers in background tabs and midiseq usually sits behind Signal. Stop
  clears queued messages, releases held notes and sends All Notes Off both
  immediately and after the last scheduled message (not every browser can
  cancel queued MIDI).
- **State split:** patch = MobX (undoable, saved); view state = jotai; engine
  runtime and transport = service observables, playhead throttled to animation
  frames.

---

## 4. Data model

```ts
type StepIndex = number   // Large 0..63 (r*8+c), Small 0..15 (r*4+c)
interface StepJSON { notes: number[]; ccs: CCEventJSON[]; state: "normal"|"rest"|"skip"; jump: JumpJSON }
interface CCEventJSON { id: number; cc: number; value: number; channel: number | "voice"; output: "all"|0|1|2|3 }
interface JumpJSON { rule: JumpRule; dest: StepIndex | null; normal: StepIndex | null }
interface LoopJSON { mode: "recorded"|"all"|"custom"; end: StepIndex }
interface VoiceJSON { enabled; pace; length; rule; offset; patternLength; pattern: PatternStepJSON[16]; velocity; channel }
interface PatchJSON {
  version: 1; name; size: "small"|"large"; loop: LoopJSON; maxNotesPerStep
  syncVoices; pace; direction; shiftAmt; tempo
  steps: StepJSON[64]; voices: VoiceJSON[4]; modOuts: ModOutJSON[8]
}
```
Machine settings (ports, clock, accent amount, latch options, theme) are local
and never saved in the file.

### 4.3 File format (`*.midiseq.json`)
```jsonc
{ "format": "midiseq", "version": 1, "app": {...}, "savedAt": "...",
  "patch": { /* PatchJSON */ }, "ui": { "selectedVoice": 0, "selectedStep": 0 } }
```
Pretty-printed; validated with zod on open; migrations by version; File System
Access API with a download/upload fallback; dirty tracking and unload warning;
localStorage autosave for crash recovery; presets stored in the same format.

---

## 5. Milestones

| # | Milestone | Done when | Status |
|---|---|---|---|
| 0 | Scaffold | Themed layout runs; check and tests pass | ✅ |
| 1 | Core engine | Every rule covered by tests; deterministic renders | ✅ |
| 2 | Player + MIDI out | A fixture patch plays in time on a loopMIDI port | |
| 3 | Core UI + commands + undo | Every setting editable, heard live, undoable | |
| 4 | Step editor | Build a sequence by hand; CCs arrive on landing | |
| 5 | Recording | Record and overdub from a hardware keyboard | |
| 6 | Jumps, actions, step options | All jump and pattern-option rules usable from the UI | |
| 7 | Mod Outs, settings, clock | Follows Signal's MIDI clock over loopMIDI | |
| 8 | Files & presets | `.midiseq.json` round-trips; crash recovery works | |
| 9 | Signal workflow & polish | Record midiseq live into Signal while synced | |

---

## 6. Decisions

| Topic | Decision |
|---|---|
| Playable range | Loop setting: Recorded / All / Custom end step |
| Hold vs Tie | Hold sustains with no retrigger; Tie overlaps into the new note |
| Grid sizes | 4×4 and 8×8 only |
| Notes per step | Max Notes per Step, default 4, range 1–16 |
| Step CC timing | Fires when the sequencer lands on the step |
| Signal integration | loopMIDI now; a Signal tab later |
| Ableton Link | Not possible in a browser |
| Built-in synth | None; MIDI output only |
