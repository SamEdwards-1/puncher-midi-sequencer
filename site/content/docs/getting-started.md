---
title: Your first sequence
group: Start here
description: Set up a sound, enter a chord, and let four voices play it their own way.
order: 1
---

## Before you start {#before-you-start}

Open PUNCHER in Chrome or Edge. You can use the built-in synth without a MIDI keyboard or external instrument. The first time you enable it, the app downloads a SoundFont and keeps it in your browser.

PUNCHER has two clocks to think about: the sequencer moves between **steps**, while each **voice** plays notes from the current step at its own pace. A step can hold up to four notes. Those notes are the material; the voices decide how to play them.

## 1. Choose a sound {#choose-a-sound}

Open **Settings → MIDI** and tick **Built-in synth** under Outputs. Wait for the SoundFont to finish loading. In the Voices panel, select **Voice 1** and choose an **Instrument**.

If you want to send MIDI to a DAW or hardware instead, follow [Connect MIDI](/docs/midi).

![Enable the built-in synth to hear the sequence directly in your browser.](/screenshots/settings-midi.png)

## 2. Enter a chord {#enter-a-chord}

Choose **File → New** for an empty patch, then click **step 1** in the grid. In the step editor, use **+ Add note** to add three notes, then set them to **C3**, **E3**, and **G3**. You can type note names into the fields.

Set the sequencer's **Size** to **4**, **Pace** to **1 Bar**, and **Loop** to **Recorded**. The recorded loop ends at the last step containing notes, CCs, or a rest. With only step 1 filled, that chord repeats.

![The step editor lists the selected step's notes. This example shows a four-note chord and a jump rule.](/screenshots/step-editor.png)

## 3. Give it a rhythm {#give-it-a-rhythm}

In **Voice 1**, switch **Enable** on, set **Pace** to **8th** and **Rule** to **Up**. Turn on a few dots in its pattern row. Disable the other voices for now so you can hear this one clearly.

Press **Play**. The voice cycles through C, E, and G as its active pattern dots arrive. Click a dot to make it silent; click it again to bring the note back. Change the voice's pace while it plays to hear the pattern speed up or slow down.

## 4. Add a second voice {#add-a-second-voice}

Enable **Voice 2**. Choose **Lowest**, set its pace to **4th** (a quarter note), and lower its pitch with the voice's **Offset** control. Give it a different instrument and a sparse pattern.

Voice 1 now plays an arpeggio while Voice 2 returns to the bottom note. Both read the same step. Add notes to steps 2–4 to hear the voices follow a chord progression.

## 5. Save your patch {#save-your-patch}

Choose **File → Save** to write a `.midiseq.json` patch. This preserves the steps, voice settings, patterns, and modulation. Use [Export MIDI or audio](/docs/export) when you want a performance you can bring into another app.

The browser also keeps a working copy, but a saved patch is the copy you can keep, move, and reopen.

