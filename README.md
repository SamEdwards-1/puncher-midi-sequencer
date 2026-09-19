# midiseq

A browser MIDI step sequencer with jumps and decoupled voices, built to work
alongside [Signal](https://signalmidi.app). See [PLAN.md](PLAN.md).

## Requirements

- Node `^20.19.0 || >=22.12.0` (Node 22 LTS recommended)
- Chrome or Edge (Web MIDI)
- On Windows, [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)
  to route MIDI to Signal

## Commands

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm install`       | Install all workspaces                |
| `npm start`         | Dev server at http://localhost:3000   |
| `npm test`          | Run Vitest in every workspace         |
| `npm run typecheck` | `tsc --noEmit` in every workspace     |
| `npm run check`     | Biome lint + format check             |
| `npm run format`    | Biome format (write)                  |

## Layout

- `app/` — React app (MobX domain stores, jotai UI state, Emotion styling)
- `packages/core/` — `@midiseq/core`: entities, engine, commands, file format
