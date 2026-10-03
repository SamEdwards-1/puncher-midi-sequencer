---
title: Find your way around
group: Start here
description: The sequencer sets the route. The grid holds the notes. The voices turn them into a performance.
order: 3
---

## The window {#the-window}

The **Sequencer** panel is on the left, the **grid and step editor** are in the middle, and **Voices** are on the right. The top bar contains the file and edit menus, settings, transport, and tempo.

![PUNCHER's three main areas: sequencer, steps, and voices. Open any screenshot for a closer look.](/screenshots/midiseq.png)

## Voice tabs {#voice-tabs}

The **Voices** panel has a tab for each of the four voices, marked with the voice's color. Select a tab to edit that voice: whether it plays, its pace, note length and rule, its transposition and scale fit, its velocity and MIDI channel, its instrument, and how many dots its pattern has. See [Voices & patterns](/docs/voices).

![Each voice has its own tab. The selected voice's settings fill the panel below the tabs.](/screenshots/voice-tabs.png)

## Pattern dots {#pattern-dots}

Below the voice settings, each voice has a row of **pattern dots**: its rhythm. A colored dot plays a note and a grey dot is silent. Faded dots lie past the end of a shorter pattern. Click a dot to toggle it, and right-click it for options such as ratchet, probability, and [condition](/docs/voices#dot-conditions). A band marks the dots the step reaches ([pace bands](/docs/voices#pace-bands)), and chevrons mark voices playing the same note at once ([collisions](/docs/voices#collisions)).

Under each row, **Mute** silences that voice and **Solo** plays it on its own. Click a row's number to select that voice. The arrows at the bottom export and import all four voices' patterns. See [Edit the pattern](/docs/voices#pattern-dots).

![Four pattern rows, one for each voice, with Mute and Solo under each.](/screenshots/pattern-dots.png)

## Envelope editor {#envelope-editor}

Under the step editor, **Velocity & CCs** shows the selected step as a piano roll of the notes the voices play. Its tabs hold a velocity lane for each voice, then the step's CC envelopes and modulated settings. Press **+** to add a CC.

Choose **Edit**, **Draw**, or **Erase** to work with points, and **Steps** or **Ramps** for how the value moves between them. **Grid** sets where new points snap. See [Velocity & CC envelopes](/docs/envelopes).

![The envelope editor with a CC 74 envelope ramping over the step's notes.](/screenshots/envelope-editor.png)

## Transport and tempo {#transport}

**Audition step** stays off until the sequence is stopped. **Record** arms MIDI input recording. Set the tempo from **20 to 400 BPM** by typing, dragging vertically, or using the minus and plus buttons.

If you cannot hear or record anything, read the note in the bottom-left corner. It reports missing routes, missing inputs, synth loading, and a browser without Web MIDI.

## Editing values {#editing-values}

Number controls support typing, minus and plus buttons, and vertical dragging. Slow dragging makes small changes; faster dragging covers more of the range. A drag creates one undo entry.

**Edit → Undo** and **Redo** also work for step edits, recording takes, and MIDI imports.
