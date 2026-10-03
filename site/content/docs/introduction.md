---
title: Introduction
group: Start here
description: What PUNCHER is, how it plays, and which browsers can run it.
order: 1
---

## What PUNCHER is {#what-it-is}

PUNCHER is a MIDI step sequencer that runs in your browser. There is nothing to install: open the page and start entering notes. Your work stays in the browser until you save a patch or export a MIDI file.

The sequencer moves through a grid of up to 64 steps, and each step holds a chord of up to four notes. Four **voices** read the current step and play it their own way, each with its own rhythm pattern, pace, note rule, and instrument. One chord can become a bass line, an arpeggio, and a pad at the same time.

Conditional jumps change the route through the grid as it plays. Velocity and CC envelopes shape each step, and modulation lets a step's envelope change the voices' and the sequencer's settings.

## What you can play it through {#sound}

PUNCHER has a **built-in synth** that plays General MIDI instruments from a SoundFont, so you can hear a sequence without any MIDI hardware. It can also send MIDI to a DAW, a hardware synth, or another app, and record from a MIDI keyboard. See [Connect MIDI](/docs/midi).

## Browser support {#browser-support}

PUNCHER reaches MIDI devices through **Web MIDI**. These browsers support it:

| Browser | Version |
| --- | --- |
| Microsoft Edge | 79 or later |
| Google Chrome | 43 or later |
| Opera | 30 or later |
| Mozilla Firefox | 108 or later |

The first time PUNCHER asks for MIDI, the browser asks for your permission. Firefox asks you to add a site permission add-on.

Safari has no Web MIDI of its own. It needs a [third-party extension](https://triglavmodular.hu/mods/safari-webmidi/). See [Safari](/docs/midi#safari).

In a browser without Web MIDI, PUNCHER shows a warning when it opens. The built-in synth still plays, but MIDI ports and keyboards can't be reached.
