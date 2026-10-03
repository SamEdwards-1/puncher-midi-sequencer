---
title: Voices & patterns
group: Build a sequence
description: Give the same notes four different rhythms, registers, and instruments.
order: 6
---

## Four independent voices {#independent-voices}

Each voice has its own pace, gate length, note rule, pitch offset, velocity, MIDI channel, and rhythm pattern. With the built-in synth enabled, it also has an instrument.

The sequencer chooses the current chord. At each active pattern dot, a voice chooses one note from that chord using its **Rule**. With no notes, it is silent. With one note, every rule chooses that note.

![All four pattern rows stay visible while you edit one voice. Right-click a dot for its options.](/screenshots/voices.png)

## Choose a note rule {#note-rules}

| Rule | Note choice |
| --- | --- |
| Nth | Voice 1 takes the lowest note, Voice 2 the next, and so on. Falls back to the highest when needed. |
| Lowest / Highest | Always the bottom or top note. |
| Up / Down | Cycles in pitch order and wraps at the end. |
| Up / Down, Down / Up | Bounces between the ends without repeating the turning note. |
| Up / Down +, Down / Up + | Plays each turning note twice. |
| Rise / Fall | Moves two positions one way, then one back, wrapping around. |
| Outside In / Inside Out | Alternates from the edges toward the center, or from the center outward. |
| Ends | Alternates the lowest and highest notes. |
| Random | Picks independently each time; repeats are possible. |
| Shuffle | Plays every note once in a random order, then reshuffles. |
| Walk | Moves one position up or down at random, turning inward at an edge. |
| No Repeat | Picks a different pitch from the last, if one is available. |

## Edit the pattern {#pattern-dots}

Patterns contain **1–16 dots**. Click a dot to toggle it. Right-click for articulation, accent, velocity, ratchet, probability, and condition. A ratchet repeats within a dot; probability and [conditions](#dot-conditions) decide whether it plays.

Dots show their settings: ratchets carry a number, low-probability dots are hollow, and holds or ties have a tail. Click a row's number to select that voice without changing its rhythm.

## Dot conditions {#dot-conditions}

A dot's **Condition** decides which passes it plays on. A pass is one visit of the voice to that dot, so each dot gets one pass every time its pattern loops. The cycle conditions work like Elektron-style conditional trigs. A dot with a condition other than Always has a small mark at its corner.

A dot plays only when its condition and its **Probability** roll both pass.

| Condition | Kind | When it plays | Passes 1–8 |
| --- | --- | --- | --- |
| Always | Constant | Every pass. The dot has no cycle restriction. | ● ● ● ● ● ● ● ● |
| 2:2 | Second of two | Silent on the first pass; plays on the second of every two (passes 2, 4, 6, 8…). | ○ ● ○ ● ○ ● ○ ● |
| 3:3 | Third of three | Silent on passes 1 and 2; plays on the third of every three (passes 3, 6, 9, 12…). | ○ ○ ● ○ ○ ● ○ ○ |
| 4:4 | Fourth of four | Silent on passes 1–3; plays on the fourth of every four (passes 4, 8, 12, 16…). | ○ ○ ○ ● ○ ○ ○ ● |
| 1x | Once on, once off | Alternates: plays one pass, skips the next. | ● ○ ● ○ ● ○ ● ○ |
| 2x | Twice on, once off | Plays two passes in a row, then skips the third. | ● ● ○ ● ● ○ ● ● |
| 3x | Three on, once off | Plays three passes in a row, then skips the fourth. | ● ● ● ○ ● ● ● ○ |
| Last | Follows the previous dot | Plays only if the voice's previous dot played. If that dot failed its probability roll or its condition, this one stays silent. | Depends on the previous dot |
| Not last | Inverse of Last | Plays only if the voice's previous dot didn't. Useful for fallback notes and alternating responses. | Depends on the previous dot |

Last and Not last respond to the probability of the dot before them, so pairing them with a low-probability dot makes a pattern that varies on every loop.

## Understand where a step starts {#pattern-phase}

By default, voice patterns continue across sequencer steps. With a bar-long step and an eighth-note voice, step 1 uses dots 1–8 and step 2 uses dots 9–16 of a sixteen-dot pattern. **Sync voices** resets the patterns at every step instead.

The piano roll and velocity lanes show the same notes. While the sequence is stopped or paused, hover a note in the piano roll, or its lollipop in a velocity lane, to highlight it and bounce a music note onto the dot that played it. Hover a dot to bring its notes forward in a velocity lane, where the others stay dimmed.

## See the dots a step reaches {#pace-bands}

Behind each pattern row, an outlined **band** marks the dots that voice plays while the sequencer sits on one step. Its length comes from the two paces: the sequencer's **Pace** divided by the voice's. Against a 1 Bar step, a 16th voice reaches 16 dots, an 8th voice 8, a 4th voice 4, and a Half voice 2. A band never covers more dots than the pattern has.

While the sequence is stopped, the bands show the step in the editor. During playback they follow the step that is sounding. Change either pace and the bands resize at once. If the step modulates a voice's pace or pattern length, the band shows the modulated value.

![Step 1 of a 1 Bar sequence. Voices at 16th, 8th, 4th, and Half pace reach 16, 8, 4, and 2 dots.](/screenshots/pace-bands.png)

## When a band wraps {#band-wraps}

Patterns continue across steps, so each band starts where the previous step left off. When a band runs past the end of the pattern, it splits in two: one part runs to the last dot and the rest carries on from dot 1. The ends where it is cut are square.

Here Voice 2 plays 8th notes from a 12-dot pattern. Step 1 reaches dots 1–8, so step 2 plays dots 9–12 and then 1–4. With **Sync voices** on, every step starts again from dot 1.

![Step 2 of the same sequence. Voice 2's band splits into dots 9–12 and 1–4; Voices 3 and 4 have moved on to dots 5–8 and 3–4.](/screenshots/pace-bands-wrap.png)

## Spot voices playing the same note {#collisions}

When two or more voices sound the same key at the same time, a downward **chevron** appears above each dot that played it. Each collision has its own color, so chevrons of one color belong together. A voice striking its own key again is not a collision. The chevrons describe the step in the editor.

Hover a marked dot to see the key and the other voices in its tooltip. The chevrons of its collisions bob while you hover.

This example plays one chord, C4–E4–G4. Voice 1 uses **Lowest** at 8th pace, so it plays C4 on every dot. Voice 2 uses **Up** at 4th pace. Its first dot plays C4 with Voice 1's first two (red). Its fourth comes back round to C4 while Voice 1 plays its last two (yellow).

![Red and yellow chevrons mark two collisions on C4 between Voice 1 and Voice 2.](/screenshots/collision-dots.png)

## Collisions in the piano roll {#collisions-piano-roll}

The piano roll under the step editor shows the same collisions: notes from different voices on the same key, overlapping in time. Each note is drawn in its voice's color. Collapse the keyboard to the keys the sequence plays to bring them closer together.

In a velocity lane, hover a dot to bring its notes forward. Here, hovering Voice 2's first dot lifts its C4 over Voice 1's two C4 notes at the start of the bar. On beat 3, Voice 2's last C4 overlaps Voice 1's again.

![Hovering Voice 2's first dot brings its C4 forward in the piano roll, over Voice 1's notes on the same key.](/screenshots/collisions.png)

## Reuse a set of voices {#reuse-patterns}

Use the arrows below the pattern rows to export or import a `.midiseqpat.json` file. It contains all four voices' settings and patterns. Importing replaces the voices in one undo operation and leaves the sequencer and its steps intact.

