---
title: Patches & MIDI import
group: Files & recording
description: Keep an editable patch or use an existing MIDI file as material for a sequence.
order: 12
---

## Save an editable patch {#patch-files}

**File → Save** writes a `.midiseq.json` file. In Chrome and Edge, saving can write back to the file you opened; other browsers download a copy. **Save as** creates a separate file.

The browser keeps a working copy every ten seconds. New, Open, and closing the tab warn about unsaved changes. Save a patch file for anything you want to keep outside this browser.

## Import MIDI into steps {#import-midi}

Choose **File → Import MIDI…**. Select the tracks and CCs, then set the starting step and notes per step. Drag the preview ruler to zoom or scroll; use the range handles to select the passage to import.

Notes enter steps in start-time order. Chords are ordered from low to high, and a key is stored only once per step. Note lengths do not determine how the resulting sequence plays: the sequencer and voices do that.

![The preview shows which notes enter each step and which extend beyond the grid.](/screenshots/import-midi.png)

## Filter and fit the material {#filter-and-fit}

Choose channels, note range, transposition, minimum velocity, and CCs. The filter begins with your MIDI input settings, but changes here apply to this import. Choose a scale and Up, Down, Exclude, or Ignore for out-of-scale notes.

Gray notes are filtered out. Red notes will not fit in the grid. **Loop until the grid is full** repeats the chosen passage. You can also import the file's tempo.

## What an import replaces {#what-changes}

The filled steps replace their previous contents. The selected note count becomes **Step notes**, and the chosen scale becomes the patch's scale. The sequencer pace stays as it was. CCs become stepped envelopes.

One undo restores the state before the import. Set default import options in **Settings → MIDI Import**.

