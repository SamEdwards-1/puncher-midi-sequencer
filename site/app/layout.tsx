import type { Metadata } from "next"
import { Header } from "../components/header"
import { ScrollingMark } from "../components/scrolling-mark"
import { tagManagerId } from "../lib/config"
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

const themeScript = `(function(){try{var m=localStorage.getItem('puncher-docs-mode');document.documentElement.dataset.mode=m==='dark'||m==='light'?m:(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.skin='moss'}catch(e){}})()`

// Google Tag Manager's own loader, as its install instructions give it
const tagManagerScript = (id: string) =>
  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`

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
        {tagManagerId !== null && (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Google Tag Manager's fixed loader, no user input; as high in the head as it goes.
            dangerouslySetInnerHTML={{ __html: tagManagerScript(tagManagerId) }}
          />
        )}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Fixed bootstrap code, no user input; applies the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {tagManagerId !== null && (
          <noscript>
            <iframe
              title="Google Tag Manager"
              src={`https://www.googletagmanager.com/ns.html?id=${tagManagerId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header index={searchIndex} />
        <ScrollingMark />
        {children}
      </body>
    </html>
  )
}
