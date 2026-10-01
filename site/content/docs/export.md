---
title: Export MIDI or audio
group: Files & recording
description: Take a performance into your DAW, export a single step, or render a finished audio file.
order: 13
---

## Export the sequence as MIDI {#export-midi}

Choose **File → Export MIDI…**. Select the voices and CCs, choose separate tracks or a single track, and set the number of passes. The preview reports the length in steps, bars, and time.

Each voice keeps its MIDI channel and instrument setting. Separate tracks put each voice on its own track and CCs on another. The export is computed silently without sending notes to your outputs.

![Choose voices, controllers, track layout, and the number of passes.](/screenshots/export-midi.png)

## Export one step {#export-a-step}

**File → Export Step MIDI…** exports the selected step for one step's duration, as the sequence first reaches it, including its CCs. The settings are shared with sequence export and **Settings → MIDI Export**.

In Chrome or Edge, you can also drag a grid step onto the desktop, a folder, or an app that accepts MIDI files. It uses those same export settings.

## Render audio {#render-audio}

Choose **File → Render Audio…** for a WAV or MP3 rendered through the SoundFont selected in **Settings → SoundFont**. This uses the built-in synth even when live playback is routed elsewhere.

Choose 44.1 or 48 kHz, stereo or mono, and the number of passes. WAV supports 16-bit, 24-bit, or 32-bit float; MP3 supports 128–320 kbps. Add up to ten seconds of tail for releases and reverb. **Normalize** brings the loudest moment to −1 dB.

Press **Render**, choose a destination, and wait for loading, rendering, and encoding to finish. **Cancel** stops the render.

![Audio render settings, including the release tail and normalization.](/screenshots/render-audio.png)

## Exports are fresh performances {#randomness}

Random rules and chance decisions are evaluated again for each export or render. Two exports of the same patch can differ. Keep a MIDI or audio export when you want to preserve a particular result; keep the patch when you want to continue editing its rules.

