"use client"

import { ArrowUpRight, AudioLines } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { appUrl } from "../lib/config"

export type NavItem = { slug: string; title: string; group: string }

export function Navigation({
  items,
  onNavigate,
}: {
  items: NavItem[]
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const groups = [...new Set(items.map((item) => item.group))]
  return (
    <nav aria-label="Documentation" className="doc-nav">
      <Link href="/" onClick={onNavigate} className="nav-overview">
        <AudioLines size={16} /> Support overview
      </Link>
      {groups.map((group) => (
        <div className="nav-group" key={group}>
          <h2>{group}</h2>
          {items
            .filter((item) => item.group === group)
            .map((item) => (
              <Link
                key={item.slug}
                href={`/docs/${item.slug}`}
                onClick={onNavigate}
                aria-current={
                  pathname === `/docs/${item.slug}` ? "page" : undefined
                }
              >
                {item.title}
              </Link>
            ))}
        </div>
      ))}
      <a href={appUrl} className="nav-launch">
        Back to making music <ArrowUpRight size={15} />
      </a>
    </nav>
  )
}
