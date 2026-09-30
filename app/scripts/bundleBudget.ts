import { gzipSync } from "node:zlib"
import type { Plugin, Rollup } from "vite"

// A production build that fails when the page's first download grows past
// what it was, or takes on code only some features need. It is set from the
// build as it stood after the audio export's encoders and synth were moved
// out of the first download (see audio/audioExport.ts): raise a number here
// when a change earns it, not to make a build pass.

export interface BundleBudget {
  // The entry chunk and everything it imports as it loads: what is fetched,
  // parsed and run before a thing is drawn. Bytes are as minified; gzip is
  // what crosses the wire.
  initial: { bytes: number; gzip: number }
  // Packages no initial chunk may hold. Each is loaded by something the user
  // has to ask for, and is large enough that one static import would pull it
  // back into every visit.
  notInitial: string[]
  // Files built apart from the page, each by the start of its name, and the
  // most bytes it may come to.
  files: Record<string, number>
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`

const sizeOf = (source: string | Uint8Array) =>
  typeof source === "string" ? Buffer.byteLength(source) : source.length

/** What is wrong with a bundle, measured against a budget; nothing if all is well. */
export const overBudget = (
  bundle: Rollup.OutputBundle,
  budget: BundleBudget,
): string[] => {
  const problems: string[] = []
  const chunks = Object.values(bundle).filter(
    (item): item is Rollup.OutputChunk => item.type === "chunk",
  )
  const entry = chunks.find((chunk) => chunk.isEntry)
  if (entry === undefined) {
    return ["The bundle has no entry chunk to measure."]
  }

  // the entry and the chunks it imports outright, not those it loads later
  const initial = new Map<string, Rollup.OutputChunk>()
  const gather = (chunk: Rollup.OutputChunk) => {
    if (!initial.has(chunk.fileName)) {
      initial.set(chunk.fileName, chunk)
      for (const name of chunk.imports) {
        const imported = bundle[name]
        if (imported?.type === "chunk") {
          gather(imported)
        }
      }
    }
  }
  gather(entry)

  const loaded = [...initial.values()]
  const bytes = loaded.reduce((sum, { code }) => sum + sizeOf(code), 0)
  const gzip = loaded.reduce((sum, { code }) => sum + gzipSync(code).length, 0)
  if (bytes > budget.initial.bytes) {
    problems.push(
      `The first download's code is ${kB(bytes)}, over its ${kB(budget.initial.bytes)}.`,
    )
  }
  if (gzip > budget.initial.gzip) {
    problems.push(
      `The first download's code is ${kB(gzip)} gzipped, over its ${kB(budget.initial.gzip)}.`,
    )
  }

  for (const name of budget.notInitial) {
    const holder = loaded.find((chunk) =>
      chunk.moduleIds.some((id) =>
        id.replaceAll("\\", "/").includes(`/node_modules/${name}/`),
      ),
    )
    if (holder !== undefined) {
      problems.push(
        `${name} is in ${holder.fileName}, which loads with the page. ` +
          `Something the page imports reaches it: import type where only ` +
          `types are wanted, or load it with import() where it is used.`,
      )
    }
  }

  for (const [prefix, most] of Object.entries(budget.files)) {
    const found = Object.values(bundle).find((item) => {
      const name = item.fileName.split("/").pop() ?? ""
      return name.startsWith(prefix) && name.endsWith(".js")
    })
    if (found === undefined) {
      problems.push(`No ${prefix} file was built to measure.`)
      continue
    }
    const size = sizeOf(found.type === "chunk" ? found.code : found.source)
    if (size > most) {
      problems.push(`${found.fileName} is ${kB(size)}, over its ${kB(most)}.`)
    }
  }

  if (problems.length === 0) {
    console.info(
      `bundle budget: first download ${kB(bytes)} of ${kB(budget.initial.bytes)}, ` +
        `${kB(gzip)} of ${kB(budget.initial.gzip)} gzipped`,
    )
  }
  return problems
}

export const bundleBudget = (budget: BundleBudget): Plugin => ({
  name: "midiseq:bundle-budget",
  apply: "build",
  // after the worker plugin has put its files in the bundle
  enforce: "post",
  generateBundle(_, bundle) {
    const problems = overBudget(bundle, budget)
    if (problems.length > 0) {
      this.error(`Over the bundle budget:\n- ${problems.join("\n- ")}`)
    }
  },
})
