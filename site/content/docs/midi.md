---
title: Connect MIDI
group: Start here
description: Route the voices to an instrument, record a keyboard, or use PUNCHER's built-in sound.
order: 4
---

## Use the built-in synth {#built-in-synth}

In **Settings → MIDI → Outputs**, tick **Built-in synth**. Select a voice to choose its General MIDI instrument. No external MIDI port is needed.

Under **Settings → SoundFont**, you can add **SF2, SF3, or DLS** files. The selected SoundFont supplies both live synth playback and audio rendering. SoundFonts are stored in the browser.

![Choose the SoundFont used by the built-in synth and audio renderer.](/screenshots/settings-soundfont.png)

## Send MIDI to another instrument {#external-output}

1. Connect your MIDI hardware, or create a virtual MIDI port for another app: with [loopMIDI](#loopmidi) on Windows, or the [IAC Driver](#macos) on a Mac.
2. In your DAW or instrument, enable that port as an input. Arm or monitor the receiving track as needed.
3. In PUNCHER, tick the same port under **Settings → MIDI → Outputs**.
4. Match the receiving instruments to the voices' MIDI channels. Each voice has a different channel.

A ticked output receives the whole sequence. **Voice outputs** can send individual voices to additional ports. To separate the voices completely, leave the shared outputs unticked and assign a port to each voice. Step CCs and clock go only to the shared, ticked outputs.

![Shared outputs carry all voices. Voice outputs add individual routes.](/screenshots/settings-midi.png)

## Windows: virtual ports with loopMIDI {#loopmidi}

Windows has no built-in way to pass MIDI between apps. [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html), a free utility by Tobias Erichsen, creates virtual MIDI ports that any app can send to or receive from.

1. Download and install loopMIDI, then open it.
2. Type a name for the port, such as `PUNCHER out`, and press **+**.
3. Reload PUNCHER, or reopen **Settings → MIDI**. The port appears under **Outputs** and **Inputs**.
4. Tick it under **Outputs** in PUNCHER, and choose it as the MIDI input in your DAW.

loopMIDI must be running for its ports to exist. Turn on its option to start with Windows if you use it often.

## macOS: Audio MIDI Setup {#macos}

A Mac manages MIDI devices in **Audio MIDI Setup**, in **Applications → Utilities**. Choose **Window → Show MIDI Studio** to see the connected devices. Apple's guide explains how to [set up MIDI devices](https://support.apple.com/guide/audio-midi-setup/set-up-midi-devices-ams875bae1e0/mac).

To send MIDI to another app on the same Mac, use the built-in **IAC Driver**:

1. In MIDI Studio, double-click **IAC Driver**.
2. Tick **Device is online**. Add more ports with **+** if you want separate routes.
3. Reload PUNCHER. The IAC ports appear under **Outputs** and **Inputs** in **Settings → MIDI**.

## Safari {#safari}

Safari does not support Web MIDI. To use MIDI devices in Safari, install the third-party [Safari WebMIDI extension](https://triglavmodular.hu/mods/safari-webmidi/) and allow it on this site. Without it, only the built-in synth is available. Edge, Chrome, Opera, and Firefox support Web MIDI directly; see [Browser support](/docs/introduction#browser-support).

## Receive notes and controllers {#midi-input}

Tick your keyboard under **Inputs**. You can enable several inputs. Use the **Input filter** to select channels, note range, transposition, and CCs. Then follow [Record a performance](/docs/recording).

If the browser blocks access, allow MIDI devices in the site's browser permissions and press **Try again** in PUNCHER.

## MIDI clock {#clock}

PUNCHER can send MIDI clock, start, and stop to every ticked output. Pausing sends stop, and playing on sends continue. Clock sends 24 ticks per beat. You can disable this in **Settings → MIDI**.

It can also follow the **tempo** of clock received on an enabled input. Incoming start and stop messages are ignored: you still control PUNCHER's transport.

