import type { Metadata } from "next"
import { Header } from "../components/header"
import { docs } from "../lib/docs"
import "./globals.css"
import "@fontsource-variable/dm-sans"
import "@fontsource-variable/space-grotesk"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"

export const metadata: Metadata = {
  title: {
    default: "PUNCHER — Support & documentation",
    template: "%s · PUNCHER Support",
  },
  description:
    "Learn PUNCHER, the browser MIDI step sequencer. Guides to independent voices, conditional jumps, modulation, recording, and export.",
}

const themeScript = `(function(){try{var m=localStorage.getItem('puncher-docs-mode');var s=localStorage.getItem('puncher-docs-skin');document.documentElement.dataset.mode=m==='dark'||m==='light'?m:(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.skin=s==='iris'?'iris':'moss'}catch(e){}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const searchIndex = docs.map(
    ({ slug, title, description, group, sections }) => ({
      slug,
      title,
      description,
      group,
      sections: sections.map(({ id, title, body }) => ({ id, title, body })),
    }),
  )
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Fixed bootstrap code, no user input; applies the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header index={searchIndex} />
        {children}
      </body>
    </html>
  )
}
