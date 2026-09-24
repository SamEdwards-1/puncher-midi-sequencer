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
| Top bar | File, Clear all, Undo/Redo · Play, Record, Tempo, position · output status, Settings · later: Presets, Mod Outs, Keyboard |
| Left | Sequencer settings (Size, Loop, Sync Voices, Pace, Direction, Shift Amt, Rest/Skip). Below a 1200px window this column folds away and the settings become a tab before Voices in the right column |
| Center | 8×8 or 4×4 step grid, step editor (with the step's jump), Hang/Bump/Flip/Shift buttons — one scrolling column, the grid stuck to its top and shrinking to 13rem as it scrolls, the editors then passing underneath |
| Right | Voice tabs 1–4; below 1200px, tabbed with the sequencer settings |

### Sequencer
- **Steps** hold up to *Step Notes* notes — 1 to 4, saved in the file — plus
  any number of CC envelopes. Four is the ceiling because a step's notes are what
  the voices draw from, and a fifth would belong to no voice.
  - A file saved while the count was a setting keeps whatever it holds; the
    notes past the fourth are dimmed and ignored until "Trim to limit"
    (undoable).
  - Recording fills a step to Step Notes before the target moves on, so notes
    land as played whether they arrive together or one at a time. What won't
    fit starts the next step, and a pitch the step already holds adds nothing,
    since a step keeps each pitch once.
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
  - Velocity: the voice's, unless the dot has its own (set in the Velocity
    lane, §5.6). An accent moves it by the *accent amount*, a setting of the
    machine (General, 1–64, default 20).
  - Condition: Always, 2:2, 3:3, 4:4, 1x, 2x, 3x, Last, Not Last
  - Plays only when both probability and condition pass.

### Actions (momentary, optionally latching)
- **Hang:** the step stops advancing; voices keep playing.
- **Bump:** inverts Sync Voices.
- **Flip:** swaps rows and columns.
- **Shift:** transposes new notes by Shift Amt.

### Step editor, recording, undo
- **Step editor:** edit notes by hand (typed as a name or stepped, transpose
  ±1/±12 — a bare letter keeps the octave, anything outside MIDI's range is
  refused) and the step's CCs, each an **envelope** across the step (below).
  A step's CC belongs to no voice, so it goes out on its own channel to every
  output. Copy/paste steps.
- **Velocity & CCs:** a tab per voice's **Velocity** — one bar per note,
  as Signal's — and a tab per CC envelope on the step. The row above the
  graph sets the lane's channel, 1–16: a Velocity tab's is its voice's,
  shared with the Voices panel, and no two voices may share one — a channel
  another voice has passes on to the next free one; a CC's is its own, and
  stays put when a voice moves. A CC added from a tab goes out on that tab's channel.
- **Velocity lane:** press a bar to set its note's velocity and drag to
  follow the mouse; press between bars to paint every bar the mouse passes.
  A bar is its dot's velocity, so every bar from that dot moves with it.
  Dropped within a quarter of the accent amount of the voice's velocity plus
  or minus that amount (±5 at 20), it snaps onto that accent; near the
  voice's own, onto a plain dot; anywhere else it is the dot's own velocity,
  kept as an offset from the voice's. The dot's size shows the level its
  velocity is nearest — plain, + or − — so small changes leave it alone.
  Dashed lines mark the accent levels.
- **CC envelopes:** a tab per CC (number and channel typed or stepped), each
  an envelope in the manner of Live's: breakpoints joined by straight lines,
  the value held before the first point and after the last, two points at one
  time making a jump. Time runs across the step, 0 to 1, so an envelope
  stretches with the sequencer's pace. It is drawn over a read-only piano roll
  of the notes the step plays — rendered from the voices, so pace, dots,
  ratchets, length and rule all show, in each voice's colour. Hovering the line,
  or dragging, shows the envelope's value under the mouse.
  - *Edit:* click the line to add a point on it, double-click anywhere to
    place one, drag a point (never past its neighbours; a straight vertical
    drag keeps its time), drag the line to raise or lower a segment, click a
    point to delete it. *Draw* (B while the graph has focus — elsewhere B is
    Bump): drag to paint, one flat value per grid cell crossed, cells a quick
    stroke skips filled in along it, as Signal's pencil does. Points snap to
    the grid (1/4 to 1/32, and triplets) unless Alt is held. A drag is one
    undo entry.
  - *Playback:* on landing each envelope sends its opening value, in list
    order and before that beat's notes — including on rests, never on skips,
    and not again while Hang holds the step. It then follows its line, read
    live every 1/48 beat and sent only when the whole value changes, so an
    envelope redrawn mid-step is heard at once. A one-point envelope is
    exactly the CC event it replaced; older files open that way.
- **Recording:** from MIDI input, the on-screen keyboard or the computer
  keyboard; a step fills to Step Notes before moving on; overdub while
  playing; rest & advance,
  back & clear, octave, and a Clear menu.
- **Undo/redo:** every patch change; a drag or a recording take is one entry.

### Mod Outs (8 CC streams)
The sequencer's own motion sent out as CC. Deferred, and described in
[NEXT.md](NEXT.md); the engine half of it is already in place.

### MIDI I/O
- Outputs are ticked, any number at once: every ticked port takes the whole
  sequence, and a voice can name one port of its own besides.
- Inputs are ticked the same way, so several keyboards can play at once.
- The All output de-duplicates notes: one note-on for simultaneous identical
  notes, a note-off before a retrigger, and the final note-off only when the
  last voice releases.
- An **input filter** decides what the ticked inputs may send in: which
  channels, which notes (a range), transposed by so many semitones, and which
  controllers. It describes the rig rather than the music, so it lives with
  the settings and never enters a patch.
- **MIDI clock out**, on unless it is turned off: start, 24 ticks to the
  quarter note and stop, to every port taking the whole sequence.
- **Tempo in**, off unless it is turned on: a clock arriving at a ticked input
  sets the tempo, and only the tempo. Start and stop are ignored, so the
  transport stays midiseq's own.
- **Ableton Link** through a small local bridge (§3.5), so midiseq shares a
  tempo and beat grid with Live, Signal and other Link apps on the machine or
  LAN. Without the bridge running, everything else still works.
- A **built-in sound** for playing on its own, so the app makes music with no
  other software (§7). MIDI output stays the primary path.
- MIDI access is requested when the app starts; browsers that block it show a
  hint and an Enable MIDI button that asks again from a click.

---

## 2. Stack & conventions (from Signal)

| Concern | Choice |
|---|---|
| Repo | npm workspaces + Turbo: `app/` and `packages/core` (`@midiseq/core`) |
| Build / test | React 19, TypeScript, Vite 7, Vitest 4 (jsdom), Testing Library |
| Lint / format | Biome with Signal's settings |
| Domain state | MobX stores on a `RootStore`, bridged with `useMobxSelector` / `useMobxGetter` |
| UI state | jotai atoms behind `useXxx()` hooks; settings via `atomWithStorage` (`midiseq.` keys) |
| Mutations & undo | Action hooks record the patch for undo, then replace it with a command's result; history is a MobX store, since the patch itself is MobX. Patches are immutable, so a snapshot is just a reference |
| Styling | Tailwind v4 over a `Theme` exposed as CSS variables (§5.2; Signal itself uses Emotion). Controls are plain elements (select, range, checkbox) rather than Radix, which the current needs don't justify |
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
interface StepJSON { notes: number[]; envelopes: EnvelopeJSON[]; state: "normal"|"rest"|"skip"; jump: JumpJSON }
interface EnvelopeJSON { id: number; cc: number; channel: number; points: { time: number /* 0..1 of the step */; value: number }[] }
interface JumpJSON { rule: JumpRule; dest: StepIndex | null; normal: StepIndex | null }
interface LoopJSON { mode: "recorded"|"all"|"custom"; end: StepIndex }
interface VoiceJSON { enabled; pace; length; rule; offset; patternLength; pattern: PatternStepJSON[16]; velocity; channel }
interface PatternStepJSON { on; articulation; accent: "none"|"+"|"-"; velocityOffset /* from the voice's velocity */; ratchet; probability; condition }
interface PatchJSON {
  version: 1; name; size: "small"|"large"; loop: LoopJSON
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
| 2 | Player + MIDI out | A fixture patch plays in time on a loopMIDI port | ✅ |
| 3 | Recording + step grid | Record and overdub from a hardware keyboard | |
| 4 | Core UI + commands + undo | Every setting editable, heard live, undoable | ✅ |
| 5 | Step editor | Build a sequence by hand; CCs arrive on landing | |
| 6 | Jumps, actions, step options | All jump and pattern-option rules usable from the UI | ✅ |
| 7 | Settings & MIDI clock | Follows Signal's MIDI clock over loopMIDI, and drives it | |
| 8 | Files & presets | `.midiseq.json` round-trips; crash recovery works | ✅ |
| 9 | Signal workflow & polish | Record midiseq live into Signal while synced | |
| 10 | Standalone sound | midiseq plays on its own, with an instrument per voice | ✅ |
| 11 | Tailwind | Every component styled with utilities; Emotion gone | ✅ |
| 12 | Custom themes | A theme can be authored, saved, exported and re-imported | |

---

## 5.1 Standalone sound (milestone 10)

Today midiseq only sends MIDI, so it needs Signal, a DAW or hardware to be
heard. A built-in sound makes it playable on its own — and makes the app
demonstrable without setting up a port first.

**Voiced the way Signal voices tracks.** Signal plays its tracks through a
SoundFont synth on an AudioWorklet: one synth instance, notes addressed per
MIDI channel, each channel set to a General MIDI program. We do the same, with
a voice's channel deciding its instrument, so the four voices can be four
different instruments.

- **`SoundFontSynth`** — loads an `.sf2` file, renders on an AudioWorklet, and
  takes the same messages a port does.
- **It plugs in as another output.** `OutputRouter` already sends to anything
  matching `MIDISink`, so the synth becomes a sink beside the MIDI ports:
  **All**, a specific voice, or off. No change to the engine or the player,
  and the same timestamps drive both, so internal and external stay together.
- **Instrument per voice** — a General MIDI program picker per voice, saved in
  the patch, sent as a program change when it changes.
- **Loading the SoundFont** — bundle a small GM set, and let a local `.sf2`
  be opened. It loads lazily, on the first note or when the synth is switched
  on, so startup stays quick.
- **Latency** — Web Audio adds output latency that a MIDI port doesn't. The
  player already schedules by timestamp; the synth converts those to the audio
  clock, with a small fixed offset so both paths line up.
- **Levels** — a master volume, and mute per voice for quick A/B while
  arranging.

**Done when:** pressing Play with no MIDI port configured makes music, each
voice can be given its own instrument, and playing to a port and to the
built-in sound at once stays in time.

## 5.2 Tailwind (milestone 11)

Emotion goes; every component is styled with Tailwind utilities. It runs
before the UI milestones still open (3, 5, 7, 9) rather than after them, so
their new UI gets written once in utilities instead of written in Emotion and
converted a second time.

**A divergence from Signal, deliberately.** Signal still styles with Emotion,
so the Signal tab in §2.1 has to survive the difference — and it can. Tailwind
v4 needs only its Vite plugin and one stylesheet import in the host, and
importing just the `theme` and `utilities` layers leaves Preflight out, so
Tailwind's reset never touches Signal's own elements. Utilities generated for
the sequencer are inert wherever they aren't used.

**The theme moves into the stylesheet.** Every `Theme` field was already
published as a CSS variable, and Tailwind v4 takes its tokens from CSS
variables, so the palette itself becomes the source: raw values as
`--midiseq-*`, with Tailwind's tokens aliased to them so a utility resolves
through the live value. Switching themes stays a runtime swap needing no
rebuild, and becomes a `data-theme` attribute on `<html>` in place of Emotion's
`ThemeProvider`. Nothing in TS needs a colour any more, not even `jumpColors`:
a jump's dot is given `var(--midiseq-jump-N)`, so `Theme.ts` keeps only the
names of the themes that exist.

**Values known only at runtime** — a jump's colour, a popup's position — can't
be class names. They keep the pattern the grid already uses: a custom property
set in `style={{}}`, read by a utility such as `bg-[var(--jump-source-color)]`.

**The awkward parts**, in order: `VoicePanel`'s pattern dots, whose `::before`
tails and `::after` corner marks carry real meaning; `SequenceGrid`'s 2000px
breakpoint, which becomes a `--breakpoint-*` token; the scrollbar rules, which
stay hand-written CSS in the global stylesheet; and `Slider`, whose track and
thumb are vendor pseudo-elements no utility can name, so they stay CSS too.
`Toggle` does go to utilities, its knob driven by `peer-checked:`.

**Shape of the work:** add `@tailwindcss/vite` and a `styles.css` holding the
layer imports, the theme tokens and what stays hand-written; convert
`components/ui/` first, since everything else is built on it; then a component
per commit; drop `@emotion/*` and the `jsxImportSource` from the Vite config
last.

**Done when:** no `@emotion` import remains, the app looks as it does now in
both themes, and the tests still pass — none of them assert on styles or class
names, so they should go through untouched.

## 5.3 Custom themes (milestone 12)

Two themes ship today, hard-coded as TS objects. Milestone 11 leaves every
colour as a CSS variable, which is most of what a theme editor needs: writing
a new value onto the root recolours the app live, with no rebuild and no
reload. This follows it for that reason.

**Seeds, not 28 colour pickers.** `Theme` has 28 fields, and asking anyone to
fill them all in is a way of making sure nobody does. A theme is authored from
a few seeds — background, text, accent, and whether content sits light on dark
— and the rest is derived, because the shipped themes are already derivations:
the dark theme's three greys are one hue at 13%, 16% and 22% lightness. Derive
in OKLCH rather than HSL, so a step in lightness looks like the same step at
every hue; Tailwind v4 works in OKLCH already. Any derived token stays
overridable on its own, for whoever does want all 28.

**Jump colours are the exception** — eight hues that have to stay clear of each
other, of the accent and of the record red. Generate them by rotating hue at
even spacing with those two excluded, and let the set be edited by hand.

**Warn, don't block.** A theme can be made unreadable. The editor reports the
contrast of text on background, and of the accent's content colour on the
accent, and says when a pair falls under the readable threshold — a warning,
not a veto, since a deliberately dim theme is the author's business.

**Stored with the settings, never in the patch.** A theme belongs to the
person, not to a piece of music, so it lives under `midiseq.theme` in local
storage beside `themeType` and never enters `.midiseq.json`: opening someone
else's sequence must not repaint your app. Themes take the versioned envelope
§4.3 already defines, so one can be exported and imported as
`*.midiseqtheme.json`, validated with zod and migrated by version. The stored
setting today is `{ themeType }`, so reading an older one has to keep working.

**In the Signal tab**, the sequencer follows Signal's theme by default. A
custom theme applies by writing its variables onto the sequencer's own root
element rather than the document's, so it recolours the tab and leaves the
rest of Signal alone.

**Done when:** a theme can be made from a handful of colours, is seen live
while being edited, survives a reload, exports and re-imports, and the
built-in dark and light are still there untouched as the starting points.

## 5.4 Settings dialog and input filter (part of milestone 7)

Everything about the rig moved out of a toolbar popup and into a Settings
dialog, on Signal's pattern: a list of pages down the left, the page beside
it. **General** holds the theme, which until now had no UI at all. **MIDI**
holds the ports and the filter.

**Ports are ticked, not picked.** Inputs and outputs are both checkbox lists,
so several keyboards can play in and several ports can take the sequence at
once. A voice can still name one port of its own, which is the one thing a
flat list can't say. A port that was ticked but is now unplugged stays on the
list, shown as disconnected, so its tick can be seen and taken off.

**The input filter** decides what the ticked inputs may send in: the channels
it listens on, the range of notes it keeps, a transpose applied after, and
which of the 128 controllers are allowed. The range is judged on the note as
it arrived and the transpose applied after, so a note and its note-off are
always treated alike and nothing is left sounding.

**Where it lives.** None of this is the music — it describes the keyboard and
the ports — so it is kept with the other settings in local storage and never
written into a patch, on the same reasoning as themes in §5.3.

**Not yet true:** nothing consumes CC input, so the CC filter decides what
reaches the app rather than what the app does with it. Recording CCs into a
step is the milestone that gives it a job.

## 5.5 MIDI clock (part of milestone 7)

**Sending.** While playing, the player schedules a clock byte every 1/24 beat
on the same grid the notes use, so the clock bends with a tempo change exactly
as the music does. Start goes out when play begins and stop when it ends, to
every port taking the whole sequence — a single voice's port has no part in a
transport.

**Taking a tempo, not a transport.** Slaving the whole transport to an
incoming clock was built and taken out again: it made playing and stopping
depend on another machine for no gain. What came back is narrower — the tempo
alone. A tick advances an average over the last 12 intervals, which follows a
change within a beat without lurching on one late message, and a gap over half
a second is a pause rather than a slow tempo, so the average starts again.
The result lands in the patch, where the tempo field shows it, and only when
the whole number changes: a steady clock writes once and then says nothing.

**What is not there yet:** song position pointer, and a tempo field that says
it is being driven from outside rather than simply being overwritten.

## 5.6 CC envelopes

**Breakpoints, not a value per grid cell.** Like Live, an envelope stores
points joined by segments, so a slow sweep is two points however fine the
grid. Draw mode's flat steps are only what the paint stroke writes — pairs of
points — and a run painted at one value keeps just its ends.

**Time is a fraction of the step.** The step's length is the sequencer's
pace, so storing 0 to 1 lets an envelope keep its shape when the pace
changes. The grid is laid over it in note values, so a 1/16 grid on a
one-bar step is sixteen cells and on a quarter-note step four.

**Read live, sent on change.** The engine samples the step's envelopes every
1/48 beat — the grid every pace sits on — from the patch as it is now, not as
it was on landing, so drawing while the sequence plays is heard straight
away. It sends a CC only when the rounded value moves, so a flat line costs
one message per landing.

**The notes underneath** are the step rendered once through the engine, as a
clicked step is auditioned: every voice starting together on its first dot.
Chance and the random rules use a fixed seed, so the picture holds still
while editing. The keys run exactly from the grid's lowest key to its
highest, across every step rather than the step on show, so the roll doesn't
jump from step to step; setting a key beyond them moves that edge. A note a
voice's offset takes past the grid's keys is left off the roll.

**Velocity is the dot's.** Notes come from pattern dots, and a voice's
pattern plays on every step, so a velocity bar edits its dot: every bar from
that dot, on this step and every other, moves with it. The dot keeps an
offset from its voice's velocity rather than a value of its own, so moving
the voice's velocity moves every bar, and an accent stays an accent — its
size set by the accent amount, not frozen at what it was when drawn. The dot
is drawn big or small for its accent, and a velocity of its own shows as
whichever level it is nearest, as drawn or after the voice's velocity or the
accent amount moves under it. A snap of ±2, the first version's, proved too
tight to find with a mouse; a quarter of the accent amount gives each level
a pull that grows with the gap.

**What is not there yet:** selecting and moving several points at once;
Live's inserting points at a time selection's edges when a segment is
dragged (there is no time selection); recording incoming CCs into an
envelope; and, with Sync Voices off, the piano roll still shows each voice
from its first dot, where in play it carries on from wherever it was.

## 6. Decisions

| Topic | Decision |
|---|---|
| Playable range | Loop setting: Recorded / All / Custom end step |
| Hold vs Tie | Hold sustains with no retrigger; Tie overlaps into the new note |
| Grid sizes | 4×4 and 8×8 only |
| Notes per step | Step Notes, 1–4 with one per voice as the ceiling, default 4. Recording fills to it before advancing |
| Step CCs | Envelopes across the step, replacing plain CC events: the opening value on landing, then the line, sent as it changes |
| Signal integration | loopMIDI now; a Signal tab later |
| Ableton Link | Not possible in a browser |
| Built-in synth | A SoundFont synth, voiced the way Signal voices tracks, so the app plays on its own (§5.1). MIDI output stays primary |
| Styling | Tailwind, though Signal uses Emotion. Utilities over the theme's CSS variables, with Preflight left out so the Signal tab stays safe (§5.2) |
| Themes | Custom themes are authored from a few seeds and derived in OKLCH. They live with the settings, never in the patch file (§5.3) |
