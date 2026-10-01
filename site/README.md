# PUNCHER support site

Next.js App Router and Tailwind CSS documentation, alongside the Vite sequencer in `../app`.

## Run locally

From the repository root:

```sh
npm install
npm run dev --workspace site
```

Open http://localhost:3001. `npm start` at the repository root starts both workspaces; the sequencer defaults to port 3000 and the support site uses 3001. To start only the sequencer, use `npm run dev --workspace app`.

## Build and check

```sh
npm run build --workspace site
npm run typecheck --workspace site
npm test --workspace site
npm run start --workspace site
# In a second terminal, while the site is running:
npm run test:smoke --workspace site
```

`test` validates guide URLs, section anchors, cross-references, and screenshot files. `test:smoke` checks all rendered routes, local links, images, and the 404 response. Set `SITE_TEST_URL` to test a different port. The site uses self-hosted font packages; a production build does not fetch fonts from Google.

## Configure the app link

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_APP_URL` to the sequencer URL. It defaults to `http://localhost:3000`. Set the production URL before building: Next.js includes it in the browser bundle at build time. The GitHub URL lives in `lib/config.ts`.

Deploy this workspace as a Next.js application. Install dependencies from the monorepo root and build with `npm run build --workspace site`. All documentation routes are prerendered; the Next.js server handles image optimization. No publishing credentials or hosting service are required for local development.

## Design system and skins

`app/globals.css` defines the skin contract at the top of the file. Components use semantic tokens exposed to Tailwind through `@theme inline`:

| Tokens | Purpose |
| --- | --- |
| `--page`, `--surface`, `--soft` | Page, cards, and inset surfaces |
| `--ink`, `--muted`, `--line` | Text and dividers |
| `--accent`, `--accent-soft`, `--accent-bright`, `--on-accent` | Interactive color and emphasis |
| `--stage`, `--shadow` | Screenshot framing |
| `--screen`, `--screen-ink`, `--overlay` | Image frames and modal surfaces |

Moss and Iris demonstrate two skins, each with light and dark modes. Add or change token values without editing components. The selector is in `components/header.tsx`. Theme preferences persist in local storage; the initial mode follows the system. A fixed inline bootstrap applies saved preferences before paint.

Typography uses **DM Sans** for body text, **Space Grotesk** for headings, and **IBM Plex Mono** for labels and keys. These Google Fonts are served locally through Fontsource packages with their OFL licenses.

## Update the documentation

Edit `lib/docs.ts`. Each guide has a slug, group, description, and sections containing Markdown. The same content supplies navigation, search, page metadata, section links, and previous/next guides. Keep existing slugs and section IDs stable for incoming links.

Screenshots in `public/screenshots` are copies of the application's documented screenshots in `../screenshots`, including the existing feature slices. Register a new image in `lib/screenshots.ts`, then reference its filename and caption in a section. Static imports provide image dimensions. The screenshot component opens the original image in a keyboard-accessible dialog.

The support site's UI follows its skin; screenshots deliberately retain the app's appearance at capture time. Refresh the source screenshots when app controls change, then copy the revised files here.

Search is local and indexes guide titles, descriptions, section titles, and prose. It opens from the header or **Ctrl/⌘ K**. Use Tab to reach a result, Enter to open it, and Escape to close. Mobile navigation and image enlargement also use native dialogs for focus trapping and Escape handling.

## Content sources

The guides were checked against the repository's README, keyboard handlers, sequencer defaults, and existing UI screenshots. The visual organization draws on [Tailwind's documentation](https://tailwindcss.com/docs). Setup follows [Next.js](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind's PostCSS integration](https://tailwindcss.com/docs/installation/using-postcss).
