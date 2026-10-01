---
title: Troubleshooting
group: Reference
description: Check the signal path, recording filters, and playback rules when something sounds wrong.
order: 15
---

## There is no sound {#no-sound}

1. Read the status at the right of the app bar.
2. Check **Settings → MIDI → Outputs**. Enable the built-in synth or the intended MIDI port.
3. If using the synth, wait for its SoundFont to load, then click Play.
4. Make sure a voice is enabled, has active pattern dots, and reads a step with notes. Check its velocity.
5. For external MIDI, check the receiving app's input, channel, track monitoring, and instrument.

A rest intentionally plays no notes. A scale fit of Exclude can also silence out-of-scale notes.

## My MIDI device is missing {#missing-midi}

Connect the device or start the virtual port utility before checking **Settings → MIDI**. Allow MIDI access in the browser's site permissions. If PUNCHER reports blocked access, use **Try again** after changing that permission.

For a predictable setup, use Chrome or Edge. A browser cannot create a virtual MIDI port for you.

## Recording does not advance {#recording}

A step advances only after it reaches **Step notes**. Playing the same key again does not fill another slot. Check the input filter and selected scale, which may reject or merge the notes you play. Lower Step notes if you want fewer notes in each step.

## The rhythm changes between steps {#unexpected-rhythm}

Voice patterns normally continue through step changes. Enable **Sync voices** to restart them at each step. Check dot probability and conditions, jump rules, and modulation when playback varies.

If the sequence stays on one step, check the **Hold** action, Latch, and any Hold envelope. A Hold envelope that is still On at step end can keep repeating the step.

## Report a problem {#report-a-problem}

If the issue persists, [open a GitHub issue](https://github.com/SamEdwards-1/puncher-midi-sequencer/issues). Include your browser and operating system, the steps to reproduce the problem, and what you expected to hear or see. A small saved patch helps reproduce sequencing issues. Remove any material you do not want to share before attaching it.

