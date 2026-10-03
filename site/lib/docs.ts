import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
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

const contentDir = join(process.cwd(), "content", "docs")

function parseDoc(filename: string): { doc: Doc; order: number } {
  const source = readFileSync(join(contentDir, filename), "utf8")
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!frontmatter) throw new Error(`${filename}: missing frontmatter`)

  const metadata = Object.fromEntries(
    frontmatter[1].split(/\r?\n/).map((line) => {
      const separator = line.indexOf(":")
      if (separator < 0)
        throw new Error(`${filename}: invalid frontmatter line: ${line}`)
      return [line.slice(0, separator), line.slice(separator + 1).trim()]
    }),
  )
  const { title, group, description } = metadata
  const order = Number(metadata.order)
  if (
    !title ||
    !group ||
    !description ||
    !Number.isInteger(order) ||
    order < 1
  ) {
    throw new Error(
      `${filename}: title, group, description, and positive order are required`,
    )
  }

  const markdown = frontmatter[2]
  const headings = [...markdown.matchAll(/^## (.+?) \{#([a-z0-9-]+)\}\s*$/gm)]
  if (!headings.length || markdown.slice(0, headings[0].index).trim()) {
    throw new Error(`${filename}: expected sections with explicit heading IDs`)
  }
  const sections = headings.map((heading, index): Section => {
    const start = heading.index + heading[0].length
    const end = headings[index + 1]?.index ?? markdown.length
    let body = markdown.slice(start, end).trim()
    const screenshot = body.match(
      /(?:^|\n\n)!\[([^\]\n]+)\]\(\/screenshots\/([a-z0-9-]+\.png)\)$/,
    )
    const section: Section = { id: heading[2], title: heading[1], body }
    if (screenshot) {
      body = body.slice(0, screenshot.index).trim()
      section.body = body
      section.image = screenshot[2] as keyof typeof screenshots
      section.caption = screenshot[1]
    }
    return section
  })

  return {
    order,
    doc: { slug: filename.slice(0, -3), title, group, description, sections },
  }
}

export const docs: Doc[] = readdirSync(contentDir)
  .filter((filename) => filename.endsWith(".md"))
  .map(parseDoc)
  .sort((a, b) => a.order - b.order)
  .map(({ doc }) => doc)

export const groups = [...new Set(docs.map((doc) => doc.group))]
export const getDoc = (slug: string) => docs.find((doc) => doc.slug === slug)
