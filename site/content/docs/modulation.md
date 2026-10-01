---
title: Modulation
group: Shape the performance
description: Use a step's envelope to change voice settings, sequencer settings, or performance actions.
order: 9
---

## Connect an envelope to a setting {#bind-a-setting}

Hover a setting's label and click its **gear**. Choose a CC and the range of values it should cover, then press **Modulate**. PUNCHER suggests an unused, undefined MIDI controller number. Two settings cannot share a CC.

The envelope opens on the selected step at the setting's current value. Draw a change to hear the modulation. Its vertical axis shows the setting's actual values, such as note paces or rules, instead of raw CC numbers.

![Voice 1's pace is controlled by a CC envelope, with a range from eighth to thirty-second notes.](/screenshots/modulation.png)

## Base values and playback values {#base-values}

A step with a bound CC envelope drives the setting. A step without one uses the field's saved value. During playback, the field displays the envelope's value in the envelope color. Hover or edit the field to see and change its saved value.

Click the gear again to change the mapping, find the affected steps, or remove the binding. Removing a binding keeps the envelopes as ordinary CCs.

## When changes take effect {#timing}

A step's duration is determined by the sequencer pace when the step begins. Voices follow their envelopes as they play. Size, Direction, and Loop are read from the outgoing step at each transition. Changes to Size or Step notes keep the underlying stored steps and notes.

**Hold**, **Sync**, **Flip**, and **Transpose** also accept modulation from their action buttons' gears. Their envelopes use Off and On. Hold and Flip are read at step end, Sync at step entry, and Transpose at each note.

## Sending modulation CCs {#external-ccs}

Modulation envelopes also send their MIDI CC messages unless **Settings → MIDI → Send modulation CCs** is off. Disable this when the controller would unintentionally change an external instrument. MIDI export has a separate **Modulation CCs** choice.

