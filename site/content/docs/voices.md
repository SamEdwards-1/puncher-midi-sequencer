---
title: Voices & patterns
group: Build a sequence
description: Give the same notes four different rhythms, registers, and instruments.
order: 5
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

Patterns contain **1–16 dots**. Click a dot to toggle it. Right-click for articulation, accent, velocity, ratchet, probability, and condition. A ratchet repeats within a dot; probability and conditions decide whether it plays.

Dots show their settings: ratchets carry a number, low-probability dots are hollow, and holds or ties have a tail. Click a row's number to select that voice without changing its rhythm.

## Understand where a step starts {#pattern-phase}

By default, voice patterns continue across sequencer steps. With a bar-long step and an eighth-note voice, step 1 uses dots 1–8 and step 2 uses dots 9–16 of a sixteen-dot pattern. **Sync voices** resets the patterns at every step instead.

An outline marks the dots used by the selected or sounding step. The piano roll and velocity lanes show the same notes. While the sequence is stopped or paused, hover a note in the piano roll, or its lollipop in a velocity lane, to highlight it and bounce a music note onto the dot that played it. Hover a dot to bring its notes forward in a velocity lane, where the others stay dimmed. Small chevrons mark simultaneous notes of the same pitch in different voices; hover to see which voices collide.

## Reuse a set of voices {#reuse-patterns}

Use the arrows below the pattern rows to export or import a `.midiseqpat.json` file. It contains all four voices' settings and patterns. Importing replaces the voices in one undo operation and leaves the sequencer and its steps intact.

