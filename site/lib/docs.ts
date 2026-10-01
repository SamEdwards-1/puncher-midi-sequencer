import type { screenshots } from "./screenshots"

export type Section = {
  id: string
  title: string
  body: string
  image?: keyof typeof screenshots
  caption?: string
}
export type Doc = {
  slug: string
  title: string
  group: string
  description: string
  sections: Section[]
}

export const docs: Doc[] = [
  {
    slug: "getting-started",
    title: "Your first sequence",
    group: "Start here",
    description:
      "Set up a sound, enter a chord, and let four voices play it their own way.",
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        body: "Open PUNCHER in Chrome or Edge. You can use the built-in synth without a MIDI keyboard or external instrument. The first time you enable it, the app downloads a SoundFont and keeps it in your browser.\n\nPUNCHER has two clocks to think about: the sequencer moves between **steps**, while each **voice** plays notes from the current step at its own pace. A step can hold up to four notes. Those notes are the material; the voices decide how to play them.",
      },
      {
        id: "choose-a-sound",
        title: "1. Choose a sound",
        body: "Open **Settings → MIDI** and tick **Built-in synth** under Outputs. Wait for the SoundFont to finish loading. In the Voices panel, select **Voice 1** and choose an **Instrument**.\n\nIf you want to send MIDI to a DAW or hardware instead, follow [Connect MIDI](/docs/midi).",
        image: "settings-midi.png",
        caption:
          "Enable the built-in synth to hear the sequence directly in your browser.",
      },
      {
        id: "enter-a-chord",
        title: "2. Enter a chord",
        body: "Choose **File → New** for an empty patch, then click **step 1** in the grid. In the step editor, use **+ Add note** to add three notes, then set them to **C3**, **E3**, and **G3**. You can type note names into the fields.\n\nSet the sequencer's **Size** to **4**, **Pace** to **1 Bar**, and **Loop** to **Recorded**. The recorded loop ends at the last step containing notes, CCs, or a rest. With only step 1 filled, that chord repeats.",
        image: "step-editor.png",
        caption:
          "The step editor lists the selected step's notes. This example shows a four-note chord and a jump rule.",
      },
      {
        id: "give-it-a-rhythm",
        title: "3. Give it a rhythm",
        body: "In **Voice 1**, switch **Enable** on, set **Pace** to **8th** and **Rule** to **Up**. Turn on a few dots in its pattern row. Disable the other voices for now so you can hear this one clearly.\n\nPress **Play**. The voice cycles through C, E, and G as its active pattern dots arrive. Click a dot to make it silent; click it again to bring the note back. Change the voice's pace while it plays to hear the pattern speed up or slow down.",
      },
      {
        id: "add-a-second-voice",
        title: "4. Add a second voice",
        body: "Enable **Voice 2**. Choose **Lowest**, set its pace to **4th** (a quarter note), and lower its pitch with the voice's **Offset** control. Give it a different instrument and a sparse pattern.\n\nVoice 1 now plays an arpeggio while Voice 2 returns to the bottom note. Both read the same step. Add notes to steps 2–4 to hear the voices follow a chord progression.",
      },
      {
        id: "save-your-patch",
        title: "5. Save your patch",
        body: "Choose **File → Save** to write a `.midiseq.json` patch. This preserves the steps, voice settings, patterns, and modulation. Use [Export MIDI or audio](/docs/export) when you want a performance you can bring into another app.\n\nThe browser also keeps a working copy, but a saved patch is the copy you can keep, move, and reopen.",
      },
    ],
  },
  {
    slug: "the-interface",
    title: "Find your way around",
    group: "Start here",
    description:
      "The sequencer sets the route. The grid holds the notes. The voices turn them into a performance.",
    sections: [
      {
        id: "the-window",
        title: "The window",
        body: "The **Sequencer** panel is on the left, the **grid and step editor** are in the middle, and **Voices** are on the right. The top bar contains the file and edit menus, settings, transport, and tempo.",
        image: "midiseq.png",
        caption:
          "PUNCHER's three main areas: sequencer, steps, and voices. Open any screenshot for a closer look.",
      },
      {
        id: "transport",
        title: "Transport and tempo",
        body: "**Play** starts playback. **Stop** takes its place while playing and silences sounding notes. **Record** arms MIDI input recording. Set the tempo from **20 to 400 BPM** by typing, dragging vertically, or using the minus and plus buttons.\n\nIf you cannot hear or record anything, read the status at the right of the top bar. It reports missing routes, missing inputs, and synth loading.",
      },
      {
        id: "editing-values",
        title: "Editing values",
        body: "Number controls support typing, minus and plus buttons, and vertical dragging. Slow dragging makes small changes; faster dragging covers more of the range. A drag creates one undo entry.\n\n**Edit → Undo** and **Redo** also work for step edits, recording takes, and MIDI imports.",
      },
      {
        id: "smaller-windows",
        title: "Smaller windows",
        body: "Below 1200px, Sequencer and Voices share a tabbed panel beside the grid. Below 876px, Grid, Voices, and Sequencer each get a tab in a single column. The controls are the same; switch tabs to reach them.",
        image: "narrow.png",
        caption: "The workspace adapts to a narrower window with panel tabs.",
      },
    ],
  },
  {
    slug: "midi",
    title: "Connect MIDI",
    group: "Start here",
    description:
      "Route the voices to an instrument, record a keyboard, or use PUNCHER's built-in sound.",
    sections: [
      {
        id: "built-in-synth",
        title: "Use the built-in synth",
        body: "In **Settings → MIDI → Outputs**, tick **Built-in synth**. Select a voice to choose its General MIDI instrument. No external MIDI port is needed.\n\nUnder **Settings → SoundFont**, you can add **SF2, SF3, or DLS** files. The selected SoundFont supplies both live synth playback and audio rendering. SoundFonts are stored in the browser.",
        image: "settings-soundfont.png",
        caption:
          "Choose the SoundFont used by the built-in synth and audio renderer.",
      },
      {
        id: "external-output",
        title: "Send MIDI to another instrument",
        body: "1. Connect your MIDI hardware, or create a virtual MIDI port for another app. On Windows, a utility such as loopMIDI provides the virtual cable.\n2. In your DAW or instrument, enable that port as an input. Arm or monitor the receiving track as needed.\n3. In PUNCHER, tick the same port under **Settings → MIDI → Outputs**.\n4. Match the receiving instruments to the voices' MIDI channels. Each voice has a different channel.\n\nA ticked output receives the whole sequence. **Voice outputs** can send individual voices to additional ports. To separate the voices completely, leave the shared outputs unticked and assign a port to each voice. Step CCs and clock go only to the shared, ticked outputs.",
        image: "settings-midi.png",
        caption:
          "Shared outputs carry all voices. Voice outputs add individual routes.",
      },
      {
        id: "midi-input",
        title: "Receive notes and controllers",
        body: "Tick your keyboard under **Inputs**. You can enable several inputs. Use the **Input filter** to select channels, note range, transposition, and CCs. Then follow [Record a performance](/docs/recording).\n\nIf the browser blocks access, allow MIDI devices in the site's browser permissions and press **Try again** in PUNCHER.",
      },
      {
        id: "clock",
        title: "MIDI clock",
        body: "PUNCHER can send MIDI clock, start, and stop to every ticked output. Clock sends 24 ticks per beat. You can disable this in **Settings → MIDI**.\n\nIt can also follow the **tempo** of clock received on an enabled input. Incoming start and stop messages are ignored: you still control PUNCHER's transport.",
      },
    ],
  },
  {
    slug: "steps",
    title: "Steps & the grid",
    group: "Build a sequence",
    description:
      "Enter notes, set the loop, and choose how the sequencer travels through the grid.",
    sections: [
      {
        id: "select-a-step",
        title: "Select a step",
        body: "Click a circle to select it and show its notes in the editor. With **Audition step** on, it also sounds. During playback, clicking queues that step to play next; during recording, it changes the recording target.\n\nAudition step also makes the editor follow playback. Turn it off to keep a particular step open while the sequence runs.",
        image: "grid.png",
        caption:
          "Filled circles contain material; colored pairs mark jumps. Step 8 is selected.",
      },
      {
        id: "notes",
        title: "Edit the notes",
        body: "Use **+ Add note**, then type or step a note name. `G#5` sets pitch and octave; `D` keeps the existing octave. The editor can transpose one note or the whole chord by a semitone or octave. **Copy**, **Paste**, and **Clear** apply to the selected step.\n\n**Step notes** sets the active note limit, from 1 to 4. Lowering it dims and silences extra notes without deleting them. **Trim to limit** removes those extras.",
      },
      {
        id: "rests-and-skips",
        title: "Rests and skips",
        body: "A **Rest** takes time but plays no notes. Its CC envelopes still run. A **Skip** is not visited. Choose the step's type in the editor, or enable **Rest** or **Skip** beside **Mark**, then click grid steps to mark or unmark them. Press the marking button again to finish.",
      },
      {
        id: "sequencer-settings",
        title: "Set the route and timing",
        body: "| Control | Behavior |\n| --- | --- |\n| Size | 1–64 steps. Steps beyond the current size are kept. |\n| Pace | Duration of each step, from 16 bars to a 32nd-note triplet. |\n| Direction | Forwards, Backwards, alternating directions, Random, or Random+. |\n| Random+ | Chooses a different step from the one just played. |\n| Loop: Recorded | Ends at the last step holding notes, CCs, or a rest. |\n| Loop: All | Includes the entire grid. |\n| Loop: Custom | Ends at the chosen Loop end. |\n| Sync voices | Starts each voice's pattern from its first dot on every step. |",
        image: "sequencer.png",
        caption:
          "Sequencer settings control the grid's timing and route, independently of the voices.",
      },
    ],
  },
  {
    slug: "voices",
    title: "Voices & patterns",
    group: "Build a sequence",
    description:
      "Give the same notes four different rhythms, registers, and instruments.",
    sections: [
      {
        id: "independent-voices",
        title: "Four independent voices",
        body: "Each voice has its own pace, gate length, note rule, pitch offset, velocity, MIDI channel, and rhythm pattern. With the built-in synth enabled, it also has an instrument.\n\nThe sequencer chooses the current chord. At each active pattern dot, a voice chooses one note from that chord using its **Rule**. With no notes, it is silent. With one note, every rule chooses that note.",
        image: "voices.png",
        caption:
          "All four pattern rows stay visible while you edit one voice. Right-click a dot for its options.",
      },
      {
        id: "note-rules",
        title: "Choose a note rule",
        body: "| Rule | Note choice |\n| --- | --- |\n| Nth | Voice 1 takes the lowest note, Voice 2 the next, and so on. Falls back to the highest when needed. |\n| Lowest / Highest | Always the bottom or top note. |\n| Up / Down | Cycles in pitch order and wraps at the end. |\n| Up / Down, Down / Up | Bounces between the ends without repeating the turning note. |\n| Up / Down +, Down / Up + | Plays each turning note twice. |\n| Rise / Fall | Moves two positions one way, then one back, wrapping around. |\n| Outside In / Inside Out | Alternates from the edges toward the center, or from the center outward. |\n| Ends | Alternates the lowest and highest notes. |\n| Random | Picks independently each time; repeats are possible. |\n| Shuffle | Plays every note once in a random order, then reshuffles. |\n| Walk | Moves one position up or down at random, turning inward at an edge. |\n| No Repeat | Picks a different pitch from the last, if one is available. |",
      },
      {
        id: "pattern-dots",
        title: "Edit the pattern",
        body: "Patterns contain **1–16 dots**. Click a dot to toggle it. Right-click for articulation, accent, velocity, ratchet, probability, and condition. A ratchet repeats within a dot; probability and conditions decide whether it plays.\n\nDots show their settings: ratchets carry a number, low-probability dots are hollow, and holds or ties have a tail. Click a row's number to select that voice without changing its rhythm.",
      },
      {
        id: "pattern-phase",
        title: "Understand where a step starts",
        body: "By default, voice patterns continue across sequencer steps. With a bar-long step and an eighth-note voice, step 1 uses dots 1–8 and step 2 uses dots 9–16 of a sixteen-dot pattern. **Sync voices** resets the patterns at every step instead.\n\nAn outline marks the dots used by the selected or sounding step. The piano roll and velocity lanes show the same notes. Small chevrons mark simultaneous notes of the same pitch in different voices; hover to see which voices collide.",
      },
      {
        id: "reuse-patterns",
        title: "Reuse a set of voices",
        body: "Use the arrows below the pattern rows to export or import a `.midiseqpat.json` file. It contains all four voices' settings and patterns. Importing replaces the voices in one undo operation and leaves the sequencer and its steps intact.",
      },
    ],
  },
  {
    slug: "jumps",
    title: "Conditional jumps",
    group: "Build a sequence",
    description:
      "Repeat a phrase, take a detour, or let chance choose the next step.",
    sections: [
      {
        id: "add-a-jump",
        title: "Add a jump",
        body: "Select a step, then choose **+ Jump rule** beside **+ Add note**. Set a rule and a destination. Use the crosshair to pick a destination directly from the grid. Each step can have one jump.\n\nWhen the rule passes, playback moves to the destination. When it fails, it follows the normal route or the **normal** step you specify. Use **X** to remove the jump.",
        image: "step-editor.png",
        caption:
          "This step jumps to step 1 half the time and otherwise continues normally.",
      },
      {
        id: "rules",
        title: "Jump rules",
        body: "| Rule | Passes when… |\n| --- | --- |\n| Always | Every visit. |\n| 1x–7x | The chosen number of visits pass, then one fails. The cycle repeats. |\n| 2:2–8:8 | The last visit in each group of two to eight arrives. |\n| 10%–90% | A new chance check succeeds at the selected probability. |\n| Last | The last jump attempted passed. |\n| Not last | The last jump attempted failed. |\n\nFor a simple variation, give the end of a phrase a **50%** jump back to its start. Some passes repeat the phrase; others continue to the next section.",
      },
      {
        id: "read-the-grid",
        title: "Read jumps in the grid",
        body: "A jump has two dots in the same color: one at the source's top right and one at the destination's bottom left. Follow the pair to see its route. Several pairs can coexist across the grid.",
        image: "grid.png",
        caption:
          "The matching colored dots connect a jump's source and destination.",
      },
    ],
  },
  {
    slug: "scales",
    title: "Scales & transposition",
    group: "Build a sequence",
    description:
      "Choose a tonal center and decide what happens to notes outside it.",
    sections: [
      {
        id: "choose-a-scale",
        title: "Choose a scale",
        body: "Set the tonic and scale in the Sequencer panel. The tags below offer up to four scales that fit the stored notes, plus **Chromatic** for no scale constraint. The wand selects the best match.\n\nThe step editor marks notes outside the scale in red, but does not change notes entered by hand. The envelope editor's keyboard also marks the scale's keys.",
      },
      {
        id: "scale-fit",
        title: "Fit notes to the scale",
        body: "Recorded notes move up to the nearest scale note. Transposed notes use the **Scale fit** setting associated with the transposition.\n\n| Fit | Result |\n| --- | --- |\n| Up | Move to the nearest scale note above. |\n| Down | Move to the nearest scale note below. |\n| Exclude | Do not play the out-of-scale note. |\n| Ignore | Play the note unchanged. |\n\nMIDI import has its own fit choice and previews the affected notes before you apply it.",
      },
      {
        id: "transpose",
        title: "Transpose voices or the sequence",
        body: "Each voice can shift its notes by up to **24 semitones** in either direction using its pitch offset. The sequencer's **Transpose** amount applies to new notes while the Transpose action is held or latched.\n\nThe patch offers major, minor, dorian, phrygian, lydian, mixolydian, harmonic minor, major pentatonic, minor pentatonic, and minor blues. MIDI import offers the wider scale library.",
      },
    ],
  },
  {
    slug: "envelopes",
    title: "Velocity & CC envelopes",
    group: "Shape the performance",
    description:
      "Shape individual hits and draw controller changes across a step.",
    sections: [
      {
        id: "velocity",
        title: "Edit note velocity",
        body: "Each voice has a **Velocity** tab under the step editor. A lollipop's head marks its start and velocity; its horizontal stem shows its length. Drag either vertically to change velocity. Click a head to reset it to the voice's velocity.\n\nIn **Draw** mode, drag across several notes to paint velocities. Notes come from the voice patterns, so you cannot add notes in this lane. Changes apply to the pattern dot that generated the note. Accent lines use **Settings → General → Accent amount**.",
        image: "velocity.png",
        caption:
          "The selected voice is bright; other voices remain visible behind it.",
      },
      {
        id: "cc-envelope",
        title: "Draw a CC envelope",
        body: "Press **+** beside the lane tabs to add a controller. Set its **CC number** and **channel**. In Edit mode, click the line to add a point, or double-click an empty area. Drag points to move them, drag the line to raise it, and click a point to delete it.\n\nSwitch to **Draw**, or press **B** while the graph has focus, to paint values. Points snap to the chosen grid. Hold **Alt** to work off-grid.",
        image: "cc-envelope.png",
        caption:
          "A ramped CC 74 envelope over the notes generated by the voices.",
      },
      {
        id: "steps-or-ramps",
        title: "Choose steps or ramps",
        body: "**Steps** holds a value until the next point. **Ramps** draws a straight transition between points. New envelopes use Steps, which also matches incoming MIDI controller messages.\n\nThe first value sends when the sequencer enters the step. The rest follows during that step. If Hold repeats the step, the envelope starts again on each repeat.",
      },
      {
        id: "zoom-and-navigation",
        title: "Zoom and move between steps",
        body: "Drag the ruler **up** to zoom in, **down** to zoom out, and **sideways** to scroll. The keyboard toggle reduces the piano roll to the keys used in the sequence.\n\nThe selected CC tab stays open when you change steps. On a step without that CC, it appears as an empty lane. Drawing there creates the envelope for that step.",
      },
    ],
  },
  {
    slug: "modulation",
    title: "Modulation",
    group: "Shape the performance",
    description:
      "Use a step's envelope to change voice settings, sequencer settings, or performance actions.",
    sections: [
      {
        id: "bind-a-setting",
        title: "Connect an envelope to a setting",
        body: "Hover a setting's label and click its **gear**. Choose a CC and the range of values it should cover, then press **Modulate**. PUNCHER suggests an unused, undefined MIDI controller number. Two settings cannot share a CC.\n\nThe envelope opens on the selected step at the setting's current value. Draw a change to hear the modulation. Its vertical axis shows the setting's actual values, such as note paces or rules, instead of raw CC numbers.",
        image: "modulation.png",
        caption:
          "Voice 1's pace is controlled by a CC envelope, with a range from eighth to thirty-second notes.",
      },
      {
        id: "base-values",
        title: "Base values and playback values",
        body: "A step with a bound CC envelope drives the setting. A step without one uses the field's saved value. During playback, the field displays the envelope's value in the envelope color. Hover or edit the field to see and change its saved value.\n\nClick the gear again to change the mapping, find the affected steps, or remove the binding. Removing a binding keeps the envelopes as ordinary CCs.",
      },
      {
        id: "timing",
        title: "When changes take effect",
        body: "A step's duration is determined by the sequencer pace when the step begins. Voices follow their envelopes as they play. Size, Direction, and Loop are read from the outgoing step at each transition. Changes to Size or Step notes keep the underlying stored steps and notes.\n\n**Hold**, **Sync**, **Flip**, and **Transpose** also accept modulation from their action buttons' gears. Their envelopes use Off and On. Hold and Flip are read at step end, Sync at step entry, and Transpose at each note.",
      },
      {
        id: "external-ccs",
        title: "Sending modulation CCs",
        body: "Modulation envelopes also send their MIDI CC messages unless **Settings → MIDI → Send modulation CCs** is off. Disable this when the controller would unintentionally change an external instrument. MIDI export has a separate **Modulation CCs** choice.",
      },
    ],
  },
  {
    slug: "actions",
    title: "Performance actions",
    group: "Shape the performance",
    description:
      "Hold a step, change the route, or shift the notes while the sequence plays.",
    sections: [
      {
        id: "actions",
        title: "The four actions",
        body: "| Action | Key | Effect |\n| --- | --- | --- |\n| Hold | H | Keeps the current step while the voices continue playing. |\n| Sync | Y | Makes the selected voice play at the sequencer's pace, one note per step. |\n| Flip | F | Swaps the grid's rows and columns from the next step onward. |\n| Transpose | T | Applies the sequencer's Transpose amount to new notes. |\n\nHold the button or key for as long as you want the action. With **Latch** enabled, one press turns it on and the next turns it off. These keys do not take over while you type in an input.",
      },
      {
        id: "try-a-variation",
        title: "Try a held variation",
        body: "Start a sequence and hold **H** on a chord you want to stay on. The voices keep running their patterns over it. Hold **T** to apply the configured transposition, then release both to continue.\n\nTo make an action part of a patch, use its gear to add [modulation](/docs/modulation). An action envelope overrides the button on steps that contain it; other steps use the button's state.",
      },
    ],
  },
  {
    slug: "recording",
    title: "Record a performance",
    group: "Files & recording",
    description:
      "Fill steps from a MIDI keyboard and capture controller movements as envelopes.",
    sections: [
      {
        id: "record-notes",
        title: "Record notes",
        body: "1. Enable your keyboard in **Settings → MIDI → Inputs**.\n2. Set **Step notes** to the number of notes each step should hold.\n3. Arm **Record**, then select the starting step.\n4. Play a chord or enter notes one at a time.\n\nThe target advances only after the step reaches its note limit. Repeating a key already in the step does not add another copy. With a scale selected, recorded notes fit upward to that scale.",
      },
      {
        id: "record-controllers",
        title: "Record controller movements",
        body: "Turn a MIDI knob while recording to capture a CC envelope. During playback, messages are timed against the sounding step. While stopped, they are spread across the recording step in arrival order.\n\nChanging the pace later keeps the envelope's timing: shorter steps play the part that fits, and longer steps hold the final value. Channel-mode messages, bank select, and RPN/NRPN data entry are excluded.",
      },
      {
        id: "finish-a-take",
        title: "Finish a take",
        body: "Turn **Record** off when finished. Pressing Play, starting a new patch, opening or saving a patch, clearing the step, or importing MIDI also ends the take. A complete take is one undo entry.\n\nIf nothing arrives, check the enabled input and its channel, note, and CC filters before trying another take.",
      },
    ],
  },
  {
    slug: "import-and-save",
    title: "Patches & MIDI import",
    group: "Files & recording",
    description:
      "Keep an editable patch or use an existing MIDI file as material for a sequence.",
    sections: [
      {
        id: "patch-files",
        title: "Save an editable patch",
        body: "**File → Save** writes a `.midiseq.json` file. In Chrome and Edge, saving can write back to the file you opened; other browsers download a copy. **Save as** creates a separate file.\n\nThe browser keeps a working copy every ten seconds. New, Open, and closing the tab warn about unsaved changes. Save a patch file for anything you want to keep outside this browser.",
      },
      {
        id: "import-midi",
        title: "Import MIDI into steps",
        body: "Choose **File → Import MIDI…**. Select the tracks and CCs, then set the starting step and notes per step. Drag the preview ruler to zoom or scroll; use the range handles to select the passage to import.\n\nNotes enter steps in start-time order. Chords are ordered from low to high, and a key is stored only once per step. Note lengths do not determine how the resulting sequence plays: the sequencer and voices do that.",
        image: "import-midi.png",
        caption:
          "The preview shows which notes enter each step and which extend beyond the grid.",
      },
      {
        id: "filter-and-fit",
        title: "Filter and fit the material",
        body: "Choose channels, note range, transposition, minimum velocity, and CCs. The filter begins with your MIDI input settings, but changes here apply to this import. Choose a scale and Up, Down, Exclude, or Ignore for out-of-scale notes.\n\nGray notes are filtered out. Red notes will not fit in the grid. **Loop until the grid is full** repeats the chosen passage. You can also import the file's tempo.",
      },
      {
        id: "what-changes",
        title: "What an import replaces",
        body: "The filled steps replace their previous contents. The selected note count becomes **Step notes**, and the chosen scale becomes the patch's scale. The sequencer pace stays as it was. CCs become stepped envelopes.\n\nOne undo restores the state before the import. Set default import options in **Settings → MIDI Import**.",
      },
    ],
  },
  {
    slug: "export",
    title: "Export MIDI or audio",
    group: "Files & recording",
    description:
      "Take a performance into your DAW, export a single step, or render a finished audio file.",
    sections: [
      {
        id: "export-midi",
        title: "Export the sequence as MIDI",
        body: "Choose **File → Export MIDI…**. Select the voices and CCs, choose separate tracks or a single track, and set the number of passes. The preview reports the length in steps, bars, and time.\n\nEach voice keeps its MIDI channel and instrument setting. Separate tracks put each voice on its own track and CCs on another. The export is computed silently without sending notes to your outputs.",
        image: "export-midi.png",
        caption:
          "Choose voices, controllers, track layout, and the number of passes.",
      },
      {
        id: "export-a-step",
        title: "Export one step",
        body: "**File → Export Step MIDI…** exports the selected step for one step's duration, as the sequence first reaches it, including its CCs. The settings are shared with sequence export and **Settings → MIDI Export**.\n\nIn Chrome or Edge, you can also drag a grid step onto the desktop, a folder, or an app that accepts MIDI files. It uses those same export settings.",
      },
      {
        id: "render-audio",
        title: "Render audio",
        body: "Choose **File → Render Audio…** for a WAV or MP3 rendered through the SoundFont selected in **Settings → SoundFont**. This uses the built-in synth even when live playback is routed elsewhere.\n\nChoose 44.1 or 48 kHz, stereo or mono, and the number of passes. WAV supports 16-bit, 24-bit, or 32-bit float; MP3 supports 128–320 kbps. Add up to ten seconds of tail for releases and reverb. **Normalize** brings the loudest moment to −1 dB.\n\nPress **Render**, choose a destination, and wait for loading, rendering, and encoding to finish. **Cancel** stops the render.",
        image: "render-audio.png",
        caption:
          "Audio render settings, including the release tail and normalization.",
      },
      {
        id: "randomness",
        title: "Exports are fresh performances",
        body: "Random rules and chance decisions are evaluated again for each export or render. Two exports of the same patch can differ. Keep a MIDI or audio export when you want to preserve a particular result; keep the patch when you want to continue editing its rules.",
      },
    ],
  },
  {
    slug: "shortcuts",
    title: "Keyboard shortcuts",
    group: "Reference",
    description:
      "Common editing commands and the keys used during a performance.",
    sections: [
      {
        id: "editing",
        title: "Editing and files",
        body: "On macOS, use **⌘** in place of **Ctrl**. Editing shortcuts leave text inputs to their normal browser behavior.\n\n| Shortcut | Command |\n| --- | --- |\n| Ctrl + Z | Undo |\n| Ctrl + Shift + Z or Ctrl + Y | Redo |\n| Ctrl + S | Save patch |\n| Ctrl + Shift + S | Save patch as |\n| Ctrl + O | Open patch |\n| Ctrl + C | Copy selected step |\n| Ctrl + V | Paste onto selected step |\n| Ctrl + = / Ctrl + − / Ctrl + 0 | Browser zoom in / out / reset |\n| Esc | Close a dialog, menu, or popup |",
      },
      {
        id: "performance",
        title: "Performance and envelopes",
        body: "| Key | Command |\n| --- | --- |\n| H | Hold |\n| Y | Sync selected voice |\n| F | Flip |\n| T | Transpose |\n| B | Toggle Draw / Edit while the envelope graph has focus |\n| Alt | Temporarily disable grid snapping while drawing or dragging |\n\nThe performance actions stay active while held. With **Latch** on, each press toggles the action instead.",
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    group: "Reference",
    description:
      "Check the signal path, recording filters, and playback rules when something sounds wrong.",
    sections: [
      {
        id: "no-sound",
        title: "There is no sound",
        body: "1. Read the status at the right of the app bar.\n2. Check **Settings → MIDI → Outputs**. Enable the built-in synth or the intended MIDI port.\n3. If using the synth, wait for its SoundFont to load, then click Play.\n4. Make sure a voice is enabled, has active pattern dots, and reads a step with notes. Check its velocity.\n5. For external MIDI, check the receiving app's input, channel, track monitoring, and instrument.\n\nA rest intentionally plays no notes. A scale fit of Exclude can also silence out-of-scale notes.",
      },
      {
        id: "missing-midi",
        title: "My MIDI device is missing",
        body: "Connect the device or start the virtual port utility before checking **Settings → MIDI**. Allow MIDI access in the browser's site permissions. If PUNCHER reports blocked access, use **Try again** after changing that permission.\n\nFor a predictable setup, use Chrome or Edge. A browser cannot create a virtual MIDI port for you.",
      },
      {
        id: "recording",
        title: "Recording does not advance",
        body: "A step advances only after it reaches **Step notes**. Playing the same key again does not fill another slot. Check the input filter and selected scale, which may reject or merge the notes you play. Lower Step notes if you want fewer notes in each step.",
      },
      {
        id: "unexpected-rhythm",
        title: "The rhythm changes between steps",
        body: "Voice patterns normally continue through step changes. Enable **Sync voices** to restart them at each step. Check dot probability and conditions, jump rules, and modulation when playback varies.\n\nIf the sequence stays on one step, check the **Hold** action, Latch, and any Hold envelope. A Hold envelope that is still On at step end can keep repeating the step.",
      },
      {
        id: "report-a-problem",
        title: "Report a problem",
        body: "If the issue persists, [open a GitHub issue](https://github.com/SamEdwards-1/puncher-midi-sequencer/issues). Include your browser and operating system, the steps to reproduce the problem, and what you expected to hear or see. A small saved patch helps reproduce sequencing issues. Remove any material you do not want to share before attaching it.",
      },
    ],
  },
]

export const groups = [...new Set(docs.map((doc) => doc.group))]
export const getDoc = (slug: string) => docs.find((doc) => doc.slug === slug)
