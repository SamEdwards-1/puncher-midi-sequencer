---
title: Scales & transposition
group: Build a sequence
description: Choose a tonal center and decide what happens to notes outside it.
order: 7
---

## Choose a scale {#choose-a-scale}

Set the tonic and scale in the Sequencer panel. The tags below offer up to four scales that fit the stored notes, plus **Chromatic** for no scale constraint. The wand selects the best match.

The step editor marks notes outside the scale in red, but does not change notes entered by hand; each voice fits them as it plays. The envelope editor's keyboard also marks the scale's keys.

## Fit notes to the scale {#scale-fit}

Two fit settings decide what happens to notes outside the scale, at different times:

- **Recording fit** (Sequencer panel) — applies only to notes coming in while you [record](/docs/recording#record-notes). It never changes playback.
- **Scale fit** (each voice) — applies to every note the voice plays, after its pitch offset and the sequencer's Transpose. It applies even when neither moves the note, so steps entered by hand with notes outside the scale are fitted too.

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

