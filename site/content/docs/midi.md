---
title: Connect MIDI
group: Start here
description: Route the voices to an instrument, record a keyboard, or use PUNCHER's built-in sound.
order: 3
---

## Use the built-in synth {#built-in-synth}

In **Settings → MIDI → Outputs**, tick **Built-in synth**. Select a voice to choose its General MIDI instrument. No external MIDI port is needed.

Under **Settings → SoundFont**, you can add **SF2, SF3, or DLS** files. The selected SoundFont supplies both live synth playback and audio rendering. SoundFonts are stored in the browser.

![Choose the SoundFont used by the built-in synth and audio renderer.](/screenshots/settings-soundfont.png)

## Send MIDI to another instrument {#external-output}

1. Connect your MIDI hardware, or create a virtual MIDI port for another app. On Windows, a utility such as loopMIDI provides the virtual cable.
2. In your DAW or instrument, enable that port as an input. Arm or monitor the receiving track as needed.
3. In PUNCHER, tick the same port under **Settings → MIDI → Outputs**.
4. Match the receiving instruments to the voices' MIDI channels. Each voice has a different channel.

A ticked output receives the whole sequence. **Voice outputs** can send individual voices to additional ports. To separate the voices completely, leave the shared outputs unticked and assign a port to each voice. Step CCs and clock go only to the shared, ticked outputs.

![Shared outputs carry all voices. Voice outputs add individual routes.](/screenshots/settings-midi.png)

## Receive notes and controllers {#midi-input}

Tick your keyboard under **Inputs**. You can enable several inputs. Use the **Input filter** to select channels, note range, transposition, and CCs. Then follow [Record a performance](/docs/recording).

If the browser blocks access, allow MIDI devices in the site's browser permissions and press **Try again** in PUNCHER.

## MIDI clock {#clock}

PUNCHER can send MIDI clock, start, and stop to every ticked output. Pausing sends stop, and playing on sends continue. Clock sends 24 ticks per beat. You can disable this in **Settings → MIDI**.

It can also follow the **tempo** of clock received on an enabled input. Incoming start and stop messages are ignored: you still control PUNCHER's transport.

