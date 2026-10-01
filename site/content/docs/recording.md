---
title: Record a performance
group: Files & recording
description: Fill steps from a MIDI keyboard and capture controller movements as envelopes.
order: 11
---

## Record notes {#record-notes}

1. Enable your keyboard in **Settings → MIDI → Inputs**.
2. Set **Step notes** to the number of notes each step should hold.
3. Arm **Record**, then select the starting step.
4. Play a chord or enter notes one at a time.

The target advances only after the step reaches its note limit. Repeating a key already in the step does not add another copy. With a scale selected, recorded notes fit upward to that scale.

## Record controller movements {#record-controllers}

Turn a MIDI knob while recording to capture a CC envelope. During playback, messages are timed against the sounding step. While stopped, they are spread across the recording step in arrival order.

Changing the pace later keeps the envelope's timing: shorter steps play the part that fits, and longer steps hold the final value. Channel-mode messages, bank select, and RPN/NRPN data entry are excluded.

## Finish a take {#finish-a-take}

Turn **Record** off when finished. Pressing Play, starting a new patch, opening or saving a patch, clearing the step, or importing MIDI also ends the take. A complete take is one undo entry.

If nothing arrives, check the enabled input and its channel, note, and CC filters before trying another take.

