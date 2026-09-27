# midiseq

A browser MIDI step sequencer with **decoupled voices** and **conditional
jumps**. The sequencer walks a grid of polyphonic steps at its own pace, while
four voices read whatever step is current at *their* own paces, each with its
own rhythm pattern and note-picking rule. The result is a small amount of
input turning into a lot of music.

It sends MIDI to anything on your machine — [Signal](https://signalmidi.app),
a DAW, or hardware — and records from any MIDI keyboard.

![midiseq](screenshots/midiseq.png)

Reading the window above: the **sequencer** and its **jumps** are on the left,
the **grid** and the selected step's **editor** in the middle, and the four
**voices** on the right. The coloured dots on steps 1–4 are jumps — each pair
shares a colour, marked at the source's top right and the destination's bottom
left. Step 5 is selected, and its four notes are listed below the grid.

## Requirements

- **Chrome or Edge.** Firefox asks for permission each session; Safari has no
  Web MIDI at all.
- **Node 22** (or 20.19+) to run it.
- **A MIDI port.** On Windows that usually means
  [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) — a free
  virtual cable — unless you have hardware plugged in. Browsers can't create
  ports of their own.

## Running it

```bash
npm install
npm start
```

Then open the address it prints — http://localhost:3000, or the next free
port if something else already has it — and allow MIDI when the browser asks.

## Setting up MIDI

midiseq makes no sound itself; it plays other instruments.

1. **Make a port.** In loopMIDI, add a port and call it something like
   `midiseq out`. Add a second one if you also want to receive clock later.
2. **Point something at it.** In Signal, open its MIDI settings and enable
   `midiseq out` as an input. In a DAW, arm a track whose input is that port.
3. **Choose outputs in midiseq.** Open the **MIDI** menu in the app bar and
   set **All** to your port. That single stream carries every voice.
   - Each voice can go to its *own* port instead, so four instruments can be
     played at once. Leave those as None to use the All stream.
   - The All stream is tidied up: two voices playing the same note at the same
     moment send one note-on, and a note is released only when the last voice
     holding it lets go.
4. **Choose an input** in the same menu if you want to record: pick your
   keyboard's port and a channel, or Omni for any.

If the menu says MIDI is blocked, allow MIDI devices in the browser's site
settings (the icon at the left of the address bar), then press **Enable MIDI**.

## Using it

**Transport.** **Play** starts the sequencer and **Record** arms recording;
stopping also silences anything still sounding. The tempo can be stepped or
typed straight into. On the left, the **File** menu starts a new patch, opens
and saves, imports MIDI, and exports it — the sequence or one step — and the
**Edit** menu holds **Undo** and **Redo**.

**Import MIDI.** **File → Import MIDI…** reads a MIDI file into the steps,
saying it is reading while it does. Its dialog keeps a preview of the file
in view at the top while its options — which fold away, like its MIDI
filter, leaving a line that sums them up — scroll underneath. The preview is
a piano roll whose ruler zooms and scrolls it just as the envelope editor's
does —
drag up to zoom in, down to zoom out, sideways to scroll. On the ruler sits
the stretch to import: drag its handles, which snap to bars or beats, or the
stretch itself. Tick the parts to import (each track's notes on each
channel; ticking several merges them) and the CCs, and choose how many notes
a step takes and the step to start from. The notes that start in the
stretch go into the steps in the order they play, that many to a step — a
chord lowest first, each key once a step, however long the notes last — and
shaded bands on the preview show which notes land in which step. The same
**MIDI filter** as the MIDI input's — channels, note range, transpose and
CCs — starts from your input's settings and can be changed for the import
alone: notes it keeps out show gray and aren't counted. Notes that would go
past the end of the grid, whatever its size, show red. The dialog says which
steps they fill; **loop until the grid is full** goes round them again, and
the file's tempo can come too. The CCs become stepped envelopes over each
step's notes. The steps filled lose what they held, the notes a step
becomes **Step notes**, the pace is left alone, and one undo takes the
import back; the grid's steps bounce in as it lands. Where it starts —
leaving out the drum channel, bringing in CCs, looping, taking the tempo,
and what the stretch snaps to — is set in **Settings → MIDI Import**.

**Export MIDI.** **File → Export MIDI…** writes the sequence as a standard
MIDI file, as it plays from its start. Tick the voices to include — each on
its own channel, with its instrument set — and the CCs: every controller the
sequence sends, from the steps' envelopes and the mod outputs, is listed by
number and channel, with **All CCs** to tick or clear the lot. Put each voice
on a track of its own, with the CCs on one more, or everything on one track.
Choose how many passes through the sequence to write; the dialog shows how
many steps, bars and seconds that comes to. **File → Export Step MIDI…** does
the same for the step in the editor alone: a step long, as the sequence
first reaches it, with that step's CCs.

These choices are kept, and shared: the two export dialogs and
**Settings → MIDI Export** all show and change the same ones. They're also
what a step dragged out of the grid holds — drag any step onto your desktop,
a folder or another app and it lands as that step's MIDI file, straight
away. Dragging a file out needs Chrome or Edge. It's worked out instantly and silently, nothing is
sent to your outputs, and chance and the random rules are rolled afresh each
time, as they would be in a performance.

**Recording.** Arm **Record**, click the step you want to start from, and play.
A step fills to **Step notes** — four by default, one for each voice — and only
then does the target move on, so it fills whether you play a chord or one note
at a time. Turn a knob and it records too, into that CC's envelope: while the
sequence plays, as a curve on the step you hear it on, from the moment it
moved; while stopped, spread across the record step in the order you turned
it. An envelope keeps its timing if you change the pace afterwards: a shorter
step plays what fits, a longer one holds the last value. Turn Record off when
you're done; pressing Play, or starting a new patch, opening or saving one,
ends the take too. Knob messages that aren't a control's position — All Sound
Off, All Notes Off and the other channel-mode messages, bank select, and
RPN/NRPN data entry — are left out, so a DAW's start/stop burst can't fill a
step with tabs.

**The grid.** Each circle is a step holding up to four notes, one for each
voice to draw from, and any number of CC envelopes. Clicking one selects it, sounds it, and shows it in
the step editor. While the sequence is playing, clicking queues that step
next instead. Turn **Audition step** off if you'd rather click silently.
The grid and the step editor scroll together: as you scroll down, the grid
stays at the top and shrinks to a compact size, and the editors carry on
underneath it.

**Clock.** midiseq sends MIDI clock — start, stop and 24 ticks a beat — to
every ticked output, so anything listening follows its tempo. In
**Settings → MIDI** you can turn that off, and you can have midiseq take its
*tempo* from a clock arriving at a ticked input instead. Only the tempo:
start and stop are ignored, so playing and stopping stay yours.

**Themes.** **Settings → Theme** goes **Light**, **Dark**, or **System**,
which follows your computer's light or dark setting. Under it you pick the
dark theme and the light theme to wear, each from the themes of its kind.

**The step editor** lists the selected step's notes by name, so you can add,
remove, retune or transpose them by hand. A note can be typed as well as
stepped — `G#5`, or just `D` to stay in the octave it is already on. Steps
can be copied and pasted.

**Velocity & CCs.** Under the notes, each voice has a **Velocity** tab: a line
with a point at every note it plays on the step, edited like a CC envelope.
Drag a point, or the line between two, to set those notes' velocities; click
a point to return its note to the voice's velocity; in **Draw**, drag across
the notes to paint them. Points come from the notes, so none can be added.
Drop a point near a dashed line and it snaps onto that accent; anywhere else the dot keeps a velocity of its own, and
grows or shrinks for whichever level it is nearest. How far an accent reaches
is **Settings → General → Accent amount**. A Velocity tab's row sets its
voice's velocity; a CC's sets its number and channel.
When there are more tabs than fit on the row, the rest wait in a menu at its
end, beside the **+**; the open tab always stays on the row.

CCs each get a tab too, with their own number and channel, and an envelope: a
line of breakpoints drawn across the step, over a piano roll of the notes the
step plays. In **Edit**, click the line to add a point, or
double-click anywhere; drag a point, or drag the line to raise it; click a
point to delete it. In **Draw** (press **B** with the graph focused), drag to
paint values across the grid. Points snap to the grid unless you hold **Alt**.
A CC envelope **Steps** — each value holds until the next point, then jumps,
as a knob's messages do — or **Ramps**, running in straight lines from point
to point; pick one with the buttons beside **Draw**. New envelopes step, and
a knob recorded into one comes back as the steps it sent. Envelopes saved
before this choice existed ramp, as they always did.

Down the left is a keyboard with a row for every key, black and white alike,
level with the roll's rows, and beside it a column ruling off each octave
under its C; the key under the mouse names itself. The button above it
collapses the scale to only the keys the sequence plays, and back. The
roll's columns shade in turn — by the bar zoomed out, by the beat or less
zoomed in — and the CC values read down the right in the envelope's blue.
The ruler along the top counts the step in bars, beats and sixteenths; drag
on it to zoom and scroll as in Live — up zooms in around where you pressed,
down zooms back out, and sideways scrolls — one at a time, changing over
whenever the drag clearly turns. The pointer hides while you drag, and a
line through the roll marks where you pressed.
An envelope sends its first value as the sequencer lands on the step, then
follows its line until the next. The open tab stays open as you click from
step to step: on a step without that CC it shows an empty, dimmed lane, and
drawing into it adds the CC there.

**Voices.** Each of the four voices has its own pace, gate length, note-picking
rule (up, down, random, highest, and so on), octave offset, velocity, channel
and rhythm pattern. Because voices run at their own pace, a single chord step
can become an arpeggio, a bass line and a lead at once. Right-click any
pattern dot for its step options: articulation, accent, velocity, ratchet,
probability and condition. A velocity typed there is kept exactly — an accent
only if it lands on one. The dot then shows what it carries. Clicking or right-clicking
a dot also selects its voice; clicking a row's number selects the voice
without changing any dots.

**Modulation.** A CC can drive a setting from the steps: a voice's pace,
length, rule, offset, offset scale fit and pattern, and the sequencer's pace,
scale and shift scale fit. Hover a setting's label and a gear appears beside
it. Click it to choose the CC — it offers the next one MIDI leaves undefined
that nothing in the patch uses yet — and the range the CC's 0 to 127 runs
across, from one of the setting's values to another, then **Modulate**. The
CC's tab opens on the step in the editor, scrolled into view, with an
envelope starting at the setting's own value, so nothing changes until it is
drawn on. A step with an envelope for that CC plays the setting as the
envelope has it; every other step plays the field's own value. Down the
envelope's right side the numbers give way to the setting's values — paces,
rules, scales — its points snap to them, and a dashed line marks the field's
own value. A step lasts as long as the sequencer's pace as it lands; the
voices follow their envelopes as they play. While the sequence plays, a
modulated field shows the value the sounding step's envelope has it at, in the
envelopes' colour, and goes back to its own value on a step without one. Point
at the field, or use it, and it shows its own value again, which is the one it
changes. A modulated setting's gear stays lit, and clicking it again lists the
steps it is on, changes the CC or the range — the envelopes follow, keeping
the values they stood for as far as the new range reaches — shows its
envelope on another step, or removes the modulation, which leaves the
envelopes as plain CCs. Removing the last of its envelopes in the envelope
editor removes the modulation too, and the gear goes back to hiding. Two
settings can't share a CC. A knob recorded on the CC lands on the setting's
values. The envelope goes out as its CC as well, unless **Send modulation
CCs** is off in Settings → MIDI; an export leaves them out when its
**Modulation CCs** box is cleared, and names the setting beside each one.
The fit fields work while there is no scale if a step can move the
sequencer to one.

The actions can be driven the same way. Hover **Hang**, **Bump**, **Flip** or
**Shift** under the grid and a gear appears at its corner; the title bar's
icons have none. An action's envelope is Off or On, and a step with one turns
the action on or off whatever its button says: Hang and Flip as the step ends
— a step whose envelope has Hang on at its end is kept until the envelope
changes or the sequence stops — Bump as the step lands, and Shift at each
note. Every other step leaves the action to its button. Bump's gear is the
selected voice's, so each voice is bumped on steps of its own. While the
sequence plays, a button a step's envelope drives shows it on or off in the
envelopes' colour, until it is pointed at or pressed.

The sequencer's **Scale** offers ten scales — major, minor, dorian, phrygian,
lydian, mixolydian, harmonic minor, the major and minor pentatonics, and minor
blues — so that a modulation can reach each of them at every tonic, and none,
within a CC's 128 values. Its **Detected** scales come from the same ten;
**Import MIDI** still offers the whole library.

**Where a step comes in.** Voices run on through their patterns at their own
paces from step to step, so a step usually comes in partway through them —
with a bar-long step and 8th-note voices, step 1 plays dots 1–8 and step 2
dots 9–16. The shaded band behind each pattern row marks the dots the step
plays: while playing, the step sounding; while stopped, the step in the
editor, as the sequence would first reach it. The piano roll and its
Velocity lanes show the same notes. Sync Voices starts every step from the
first dots instead.

**Collisions.** When two or more voices sound the same note at the same time
on the step in the editor, the dots that played it get a small downward
chevron above them — one colour per collision, so separate ones stay apart.
Hover a marked dot to name the note and the other voices, and to set every
chevron of its collision bobbing.

**Jumps** are what make a sequence wander. Any step can jump to any other step
when its rule passes — always, every third visit, 25% of the time, and so on.
A jump draws as a coloured pair in the grid: the source marked at its top
right, the destination at its bottom left. Failed jumps fall through to the
next step, or to a "normal" step you choose. A step has one jump, added in the
step editor with **+ Jump rule** beside **+ Add note**: one row holds its rule
and the destination and normal step, each picked from the grid with its
crosshair button, and its **X** takes the whole jump away.

**Narrow windows.** Below 1200px wide, the Sequencer settings leave their own
column and become a tab beside Voices, on the left, with the grid on the
right. Below 876px everything shares one column, with a tab each for the
Grid, Voices and Sequencer.

**Actions** change the sequence as it plays, held down or latched:

| | |
|---|---|
| **Hang** | the step stops advancing while the voices keep playing |
| **Bump** | flips Sync Voices, so voices restart with each step, or don't |
| **Flip** | swaps the grid's rows and columns, from the next step on |
| **Shift** | transposes new notes by the Shift amount |

**Saving.** **File → Save** writes a `.midiseq.json` file. In Chrome and Edge
it saves straight back to the file you opened. The title shows a dot while
there are unsaved changes, and the working patch is kept in the browser every
few seconds, so a crash doesn't lose it.

## Keyboard

| Key | Does |
|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `Ctrl+S` / `Ctrl+Shift+S` | save / save as |
| `Ctrl+O` | open |
| `H` `B` `F` `S` | hold Hang, Bump, Flip, Shift |

## Development

| Command | Does |
|---|---|
| `npm start` | dev server |
| `npm test` | all tests |
| `npm run typecheck` | `tsc --noEmit` everywhere |
| `npm run check` | Biome lint and format |
| `npm run theme -- <theme.json>` | a theme from a VS Code theme (below) |

- `packages/core` — the sequencer itself: entities, the engine, patch
  commands and the file format. No React, no MobX, fully unit-tested.
- `app` — the React app: MobX for the patch, jotai for view state, Tailwind
  for styling, and the services that talk to Web MIDI.

The engine works in floating-point beats and hands the player timestamped
events; the player schedules about 100 ms ahead from a Web Worker, so playback
keeps time even when the tab is in the background.

### Themes

Every colour is a CSS variable, and a theme is a set of them selected by
`data-theme` on the page. The defaults, Deep Harbor for dark and Overcast for
light, live in `app/src/styles.css`. More can be made from any VS Code colour
theme:

```bash
npm run theme -- path/to/theme.json --name "Midnight"
```

The theme's JSON can have comments, as VS Code's often do. The name defaults
to the theme's own, or else its file's; `--id` and `--type dark|light`
override what the utility works out. It needs Node 22.18 or later, which runs
the TypeScript as it is.

The two don't name the same things, and most VS Code themes set only some of
their colours, so nothing is copied across one for one. A layout of the
same kind, in `app/src/theme/layout.css`, is the pattern: how much darker
the ruler is than the background, how far secondary text sits from primary,
which hue each voice and jump has. That layout is rebuilt on the VS Code theme's background, text
and accent. A VS Code colour is taken wherever it plays the same part and
sits where ours does, the title bar for the top bar say, and the rest is
tinted with the theme's hue.

The accent, the colour controls light when they're on, is the theme's own
mark for what's active: the active activity-bar or tab border, then its
button and badge. Red is left to recording unless the theme's buttons are red
themselves. A CC's envelope is drawn in the accent too. The voices take the
theme's chart colours, then its terminal's blue, yellow, green and magenta,
then its nearest syntax colours. Jumps and collision marks come from the
brights instead: the bright colours of every VS Code theme kept, gathered
into `app/src/theme/brights.ts`, so they stand out the same way whichever
theme is on. Each takes the bright nearest its built-in hue, no two alike,
and none so close to the accent, recording or a voice as to be taken for
it. Where a theme leaves a
key to VS Code, the colour on its commented-out line (as VS Code exports
them) stands in for the accent and the voices.

Then everything is checked for legibility: text against its background, the
step counts against the voice colours, the ruler's numbers against the ruler.
Anything short of that is lightened or darkened just far enough.

Where the utility's choices don't suit a theme, it can be told:

| Option                        | Does                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `--drama 0-1`                 | Pushes the grid's steps and the backgrounds apart, and colours them more               |
| `--accent key-or-colour`      | The accent, in place of the theme's own mark for what's active                         |
| `--tint key-or-colour`        | What the drama draws the grid toward, in place of the accent                           |
| `--voices a,b,c,d`            | The four voices, each a key or a colour, where the theme's names mislead               |
| `--background key-or-colour`  | The background, in place of `editor.background`                                        |
| `--set name=key-or-colour`    | Any of our colours outright, `--set ruler-label=#f7b83d` say; as many times as wanted |

A key is one of the VS Code theme's, commented-out ones included. What was
asked is kept in `themes.json`, so `--all` makes the theme the same way again.

It writes `app/src/theme/themes/<id>.css`, with a comment beside each colour
saying where it came from, and lists the theme in `themes.json`, which
Settings → Theme reads, offering it among the dark themes or the light. The
VS Code theme is kept beside it as `<id>.vscode.json`, so
`npm run theme -- --all` can make every theme again: after a colour is added
to the layout, say. It gathers the brights afresh first, and draws the
default themes' jumps and collisions in `styles.css` from them too. A test
fails until that has been done.
