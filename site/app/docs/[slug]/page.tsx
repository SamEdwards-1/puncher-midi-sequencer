import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Navigation } from "../../../components/navigation"
import { Screenshot } from "../../../components/screenshot"
import { githubUrl } from "../../../lib/config"
import { docs, getDoc } from "../../../lib/docs"

export function generateStaticParams() {
  return docs.map(({ slug }) => ({ slug }))
}
export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const doc = getDoc((await params).slug)
  return { title: doc?.title, description: doc?.description }
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const doc = getDoc((await params).slug)
  if (!doc) notFound()
  const position = docs.indexOf(doc)
  const previous = docs[position - 1]
  const next = docs[position + 1]
  return (
    <div className="docs-layout">
      <aside className="sidebar">
        <Navigation
          items={docs.map(({ slug, title, group }) => ({ slug, title, group }))}
        />
      </aside>
      <main id="main" className="doc-main">
        <div className="doc-breadcrumb">
          <Link href="/">Support</Link>
          <span>/</span>
          <span>{doc.group}</span>
        </div>
        <header className="doc-title">
          <p className="eyebrow">{doc.group}</p>
          <h1>{doc.title}</h1>
          <p>{doc.description}</p>
        </header>
        <details className="mobile-toc">
          <summary>On this page</summary>
          <nav aria-label="Page contents">
            {doc.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
        </details>
        <article className="doc-article">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>
                <a href={`#${section.id}`}>
                  {section.title}
                  <span aria-hidden="true">#</span>
                </a>
              </h2>
              <div className="prose">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <section
                        className="table-scroll"
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll this overflow region.
                        tabIndex={0}
                        aria-label={`${section.title} reference table`}
                      >
                        <table>{children}</table>
                      </section>
                    ),
                  }}
                >
                  {section.body}
                </Markdown>
              </div>
              {section.image && (
                <Screenshot
                  src={section.image}
                  caption={section.caption || section.title}
                />
              )}
            </section>
          ))}
        </article>
        <div className="doc-feedback">
          <span>Something missing or unclear?</span>
          <a
            href={`${githubUrl}/issues/new?title=${encodeURIComponent(`Documentation: ${doc.title}`)}`}
          >
            Suggest an improvement <ArrowUpRight size={14} />
          </a>
        </div>
        <nav aria-label="Adjacent guides" className="page-pagination">
          {previous ? (
            <Link href={`/docs/${previous.slug}`}>
              <span>
                <ArrowLeft size={14} /> Previous
              </span>
              <strong>{previous.title}</strong>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="next">
              <span>
                Next <ArrowRight size={14} />
              </span>
              <strong>{next.title}</strong>
            </Link>
          )}
        </nav>
        <div className="doc-bottom">
          PUNCHER <span>/ Support & documentation</span>
        </div>
      </main>
      <aside className="toc">
        <p>On this page</p>
        <nav aria-label="On this page">
          {doc.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>
        <div className="toc-help">
          <span className="eyebrow">NEED A HAND?</span>
          <p>Start with the signal path.</p>
          <Link href="/docs/troubleshooting">
            Troubleshooting <ArrowUpRight size={13} />
          </Link>
        </div>
      </aside>
    </div>
  )
}
