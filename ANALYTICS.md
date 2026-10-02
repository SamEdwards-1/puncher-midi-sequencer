# Analytics

The docs and the editor both load the Google Tag Manager container
**GTM-TGX7SPN4**. Both are served from punchermidi.app, the docs at `/` and the
editor at `/edit`, so one Google Analytics 4 property and one web data stream
covers both, and a visit that goes from the docs into the editor stays one
session.

Only production builds load it, so `npm start` and the tests send nothing.

- **Docs:** `site/app/layout.tsx` puts Tag Manager's loader in the head and its
  `<noscript>` frame at the top of the body, on every page. The ID is in
  `site/lib/config.ts`.
- **Editor:** `app/scripts/tagManager.ts`, a Vite plugin that only runs in
  `vite build`, adds the same two tags to `index.html`. The ID is in
  `app/vite.config.ts`.

The code doesn't talk to Google Analytics directly. It pushes events onto
Tag Manager's `dataLayer`, and the container decides what to send on. Each
event looks like this:

```js
dataLayer.push({ event_params: null }) // clears the previous event's parameters
dataLayer.push({ event: "midi_export", event_params: { scope: "step", method: "drag" } })
```

The parameters sit under `event_params` and are cleared before each event.
The data layer merges every push into what it already holds, so without the
clearing, one event's parameters would carry over to the next. Google's own
ecommerce events use the same pattern. The editor's helpers are in
`app/src/services/analytics.ts`, and the docs' helper is in
`site/lib/analytics.ts`.

No file, patch, device or SoundFont names are sent, and no error messages
that could contain them. Searches typed into the docs are sent as typed.

## Events

### Editor

| Event | Parameters | When |
|---|---|---|
| `playback_start` | `output`: `synth`, `midi`, `both` or `none` | Playback starts, from any source: the button, a key or an agent. `output` is where the sequence is heard. |
| `recording_start` | | Record is armed. |
| `midi_access` | `result`: `granted`, with `output_count` and `input_count` (connected ports, not counting the built-in synth); or `failed`, with `error_name` | The browser grants Web MIDI access or refuses it. |
| `settings_view` | `tab`: `general`, `theme`, `midi`, `soundfont`, `export` or `import` | The settings dialog opens, and again each time another group is picked in it. |
| `patch_new` | | File → New. |
| `patch_open` | `source`: `picker` or `recent` | A patch opens. |
| `patch_save` | `method`: `save` or `save_as` | A patch is saved. |
| `patterns_export` / `patterns_import` | | Patterns are exported or imported. |
| `midi_export` | `scope`: `sequence` or `step`; `method`: `file` or `drag` | A MIDI file is written, or a step is dragged out of the page as one. |
| `midi_import` | | The import dialog imports a MIDI file. |
| `audio_export` | `format`: `wav` or `mp3` | An audio render is saved. |
| `soundfont_add` | | A SoundFont is added from disk. |
| `modulation_set` | `target`, `voice`, `cc`, `change`: `assign` or `edit`, `via`: `editor` or `agent` | A setting is given a modulation (`assign`), or the one it has is changed (`edit`). In the editor, changes made while the gear's popover is open count as one `edit`. |
| `modulation_remove` | `target`, `voice`, `via` | A setting's modulation is taken away. |
| `webmcp_tool` | `tool_name`, e.g. `set_steps` | An agent calls one of the WebMCP tools. See [WEBMCP.md](WEBMCP.md). |
| `app_error` | `action`, `error_name`, and for uncaught errors `error_message` (at most 100 characters) | A file action fails, with `action` naming it (e.g. `save the patch`), or an error nothing caught reaches the page (`action` is `uncaught`). |

`target` is what is modulated: `voice.<setting>` (`pace`, `length`, `rule`,
`transposeAmt`, `transposeFit`, `patternLength`), `sequencer.<setting>`
(`pace`, `scale`, `transposeFit`, `size`, `direction`, `loop`, `transposeAmt`,
`maxNotesPerStep`) or `action.<action>` (`hold`, `flip`, `transpose`, `sync`).
`voice` is 1 to 4, and is only sent for a voice's settings and for Sync.

### Docs

| Event | Parameters | When |
|---|---|---|
| `search` | `search_term` (at most 100 characters), `result_count` | The search dialog closes after a search. A term is counted once, even if the dialog is reopened without changing it. This is GA4's recommended `search` event. |
| `launch_app` | `link_location`: `header` or `navigation` | A link into the editor is clicked. Because the editor is on the same site, GA4 wouldn't count this as an outbound click. |
| `theme_change` | `setting`: `mode` or `skin`; `value` | Light/dark mode or the accent changes. |
| `screenshot_open` | `screenshot`, e.g. `homepage.png` | A screenshot is enlarged. |

GA4's enhanced measurement covers the rest without any code: page views,
including the docs' client-side navigation (keep **Page changes based on
browser history events** turned on), scrolling, outbound links such as GitHub,
and file downloads.

## Setting up the container

At the time of writing, the container loads but has no Google Analytics tag,
so nothing reaches Analytics until these steps are done.

1. In Google Analytics, create a GA4 property with a web data stream for
   `https://punchermidi.app`. Keep enhanced measurement on, and note the
   measurement ID (`G-…`).
2. In Tag Manager, add a **Google tag** with that ID, triggered on
   **Initialization – All Pages**. This sends the page views.
3. Add a **Data Layer Variable** (version 2) for each parameter, named after
   it, e.g. `event_params.output`. The full list: `output`, `result`,
   `output_count`, `input_count`, `error_name`, `tab`, `source`, `method`,
   `scope`, `format`, `target`, `voice`, `cc`, `change`, `via`, `tool_name`,
   `action`, `error_message`, `search_term`, `result_count`, `link_location`,
   `setting`, `value`, `screenshot`.
4. Add a **Custom Event** trigger with **Use regex matching** on and this event
   name:

   ```
   ^(playback_start|recording_start|midi_access|settings_view|patch_new|patch_open|patch_save|patterns_export|patterns_import|midi_export|midi_import|audio_export|soundfont_add|modulation_set|modulation_remove|webmcp_tool|app_error|search|launch_app|theme_change|screenshot_open)$
   ```

5. Add a **Google Analytics: GA4 Event** tag with the same measurement ID,
   **Event Name** `{{Event}}`, and a row under **Event Parameters** for each
   variable from step 3 (parameter `output`, value `{{event_params.output}}`,
   and so on). A parameter an event doesn't have is left out of that event.
   Fire it on the trigger from step 4.
6. In Google Analytics, under **Admin → Custom definitions**, register each
   parameter you want in reports as an event-scoped custom dimension, or as a
   custom metric for `output_count`, `input_count`, `result_count` and `cc`.
   `search_term` is built in.
7. Build the site with `npm run build:publish`, serve `dist/publish`, and check
   the events in Tag Manager's **Preview** (Tag Assistant). Then submit and
   publish the container.

There's no consent banner. If one is needed for EU/UK visitors, set it up in
the container with Consent Mode and a consent management platform template.
The code doesn't need to change.
