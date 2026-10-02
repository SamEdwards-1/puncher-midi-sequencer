# PUNCHER support site

Next.js App Router and Tailwind CSS documentation, alongside the Vite sequencer in `../app`.

## Run locally

From the repository root:

```sh
npm install
npm run dev --workspace site
```

The support site starts at http://localhost:3001. If that port is occupied, the terminal prints the next available port, starting with 3002. `npm start` at the repository root starts both workspaces; the sequencer prefers port 3000. To start only the sequencer, use `npm run dev --workspace app`. Set `PORT` to request an exact site port.

## Build and check

```sh
npm run build --workspace site
npm run typecheck --workspace site
npm test --workspace site
npm run dev --workspace site
# In a second terminal, while the site is running:
npm run test:smoke --workspace site
```

`test` validates guide URLs, section anchors, cross-references, and screenshot files. `test:smoke` checks all rendered routes, local links, images, and the 404 response. Set `SITE_TEST_URL` to test a different port. The site uses self-hosted font packages; a production build does not fetch fonts from Google. A production build writes static files to `site/out`.

## Configure the app link

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_APP_URL` to the sequencer URL if needed. It defaults to `http://localhost:3000` in development and `/edit` in production. Next.js includes the URL in the browser bundle at build time. The GitHub URL lives in `lib/config.ts`.

## Publish the docs and editor together

From the repository root, run `npm run build:publish`. This builds the Next.js documentation as static HTML and the Vite editor with an `/edit/` asset base, then assembles both into `dist/publish`. The docs live at `/` and `/docs/*`; the editor lives at `/edit`. Deploy `dist/publish` as one static site.

For Cloudflare Pages, connect the repository with its root as the build directory, use `npm run build:publish` as the build command, and set `dist/publish` as the output directory. Attach `punchermidi.app` to that Pages project. An apex domain on Pages requires Cloudflare nameservers, so add the domain to Cloudflare and change its nameservers at GoDaddy. Keep any existing email or other DNS records when moving DNS. The default production app link is `/edit`; set `NEXT_PUBLIC_APP_URL` at build time only if the editor URL changes. No publishing credentials or hosting service are required for local development.

## Analytics

A production build loads the Google Tag Manager container set in `lib/config.ts` on every page; `npm run dev` doesn't. Search, editor launches, theme changes, and enlarged screenshots are pushed to its data layer through `lib/analytics.ts`. [ANALYTICS.md](../ANALYTICS.md) lists the events and how the container is set up.

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

Edit the guide files in `content/docs`. Each `.md` filename is its URL slug (for example, `getting-started.md` becomes `/docs/getting-started`). The frontmatter sets the title, group, description, and navigation order. Use `## Section title {#section-id}` for sections so their links remain stable. The site reads these files for navigation, search, page metadata, section links, and previous/next guides. Keep existing filenames and section IDs stable for incoming links.

Screenshots in `public/screenshots` are copies of the application's documented screenshots in `../screenshots`, including the existing feature slices. Register a new image in `lib/screenshots.ts`, then add `![Caption](/screenshots/filename.png)` at the end of a section in its Markdown file. Static imports provide image dimensions. The screenshot component opens the original image in a keyboard-accessible dialog.

The support site's UI follows its skin; screenshots deliberately retain the app's appearance at capture time. Refresh the source screenshots when app controls change, then copy the revised files here.

Search is local and indexes guide titles, descriptions, section titles, and prose. It opens from the header or **Ctrl/⌘ K**. Use Tab to reach a result, Enter to open it, and Escape to close. Mobile navigation and image enlargement also use native dialogs for focus trapping and Escape handling.

## Content sources

The guides were checked against the repository's README, keyboard handlers, sequencer defaults, and existing UI screenshots. The visual organization draws on [Tailwind's documentation](https://tailwindcss.com/docs). Setup follows [Next.js](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind's PostCSS integration](https://tailwindcss.com/docs/installation/using-postcss).
