import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { githubUrl } from "../lib/config"

export function Footer() {
  return (
    <footer className="site-footer">
      <span>
        PUNCHER <span className="text-muted">/ A browser MIDI sequencer.</span>
      </span>
      <div>
        <Link href="/docs/shortcuts">Shortcuts</Link>
        <a href={`${githubUrl}/issues`}>
          Report an issue <ArrowUpRight size={13} />
        </a>
      </div>
    </footer>
  )
}
