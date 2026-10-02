---
title: Scales & transposition
group: Build a sequence
description: Choose a tonal center and decide what happens to notes outside it.
order: 7
---

## Choose a scale {#choose-a-scale}

Set the tonic and scale in the Sequencer panel. The tags below offer up to four scales that fit the stored notes, plus **Chromatic** for no scale constraint. The wand selects the best match.

The step editor marks notes outside the scale in red, but does not change notes entered by hand. The envelope editor's keyboard also marks the scale's keys.

## Fit notes to the scale {#scale-fit}

Recorded notes move up to the nearest scale note. Each voice fits every note it plays with its own **Scale fit** setting, even with a pitch offset of 0. Notes the sequencer's Transpose moves use the sequencer's **Scale fit**.

| Fit | Result |
| --- | --- |
| Up | Move to the nearest scale note above. |
| Down | Move to the nearest scale note below. |
| Exclude | Do not play the out-of-scale note. |
| Ignore | Play the note unchanged. |

MIDI import has its own fit choice and previews the affected notes before you apply it.

## Transpose voices or the sequence {#transpose}

Each voice can shift its notes by up to **24 semitones** in either direction using its pitch offset. The sequencer's **Transpose** amount applies to new notes while the Transpose action is held or latched.

The patch offers major, minor, dorian, phrygian, lydian, mixolydian, harmonic minor, major pentatonic, minor pentatonic, and minor blues. MIDI import offers the wider scale library.

