---
title: Steps & the grid
group: Build a sequence
description: Enter notes, set the loop, and choose how the sequencer travels through the grid.
order: 4
---

## Select a step {#select-a-step}

Click a circle to select it and show its notes in the editor. With **Audition step** on, it also sounds. During playback, clicking queues that step to play next; during recording, it changes the recording target.

Audition step also makes the editor follow playback. Turn it off to keep a particular step open while the sequence runs.

![Filled circles contain material; colored pairs mark jumps. Step 8 is selected.](/screenshots/grid.png)

## Edit the notes {#notes}

Use **+ Add note**, then type or step a note name. `G#5` sets pitch and octave; `D` keeps the existing octave. The editor can transpose one note or the whole chord by a semitone or octave. **Copy**, **Paste**, and **Clear** apply to the selected step.

**Step notes** sets the active note limit, from 1 to 4. Lowering it dims and silences extra notes without deleting them. **Trim to limit** removes those extras.

## Rests and skips {#rests-and-skips}

A **Rest** takes time but plays no notes. Its CC envelopes still run. A **Skip** is not visited. Choose the step's type in the editor, or enable **Rest** or **Skip** beside **Mark**, then click grid steps to mark or unmark them. Press the marking button again to finish.

## Set the route and timing {#sequencer-settings}

| Control | Behavior |
| --- | --- |
| Size | 1–64 steps. Steps beyond the current size are kept. |
| Pace | Duration of each step, from 16 bars to a 32nd-note triplet. |
| Direction | Forwards, Backwards, alternating directions, Random, or Random+. |
| Random+ | Chooses a different step from the one just played. |
| Loop: Recorded | Ends at the last step holding notes, CCs, or a rest. |
| Loop: All | Includes the entire grid. |
| Loop: Custom | Ends at the chosen Loop end. |
| Sync voices | Starts each voice's pattern from its first dot on every step. |

![Sequencer settings control the grid's timing and route, independently of the voices.](/screenshots/sequencer.png)

