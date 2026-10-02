import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const docs = join(root, "site", "out")
const editor = join(root, "app", "dist")
const output = join(root, "dist", "publish")

for (const path of [docs, editor]) {
  if (!existsSync(path)) throw new Error(`Missing build output: ${path}`)
}

// Keep the cleanup scoped to this repository's generated publish directory.
if (relative(root, output) !== join("dist", "publish")) {
  throw new Error(`Unexpected publish directory: ${output}`)
}
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
cpSync(docs, output, { recursive: true })
cpSync(editor, join(output, "edit"), {
  recursive: true,
  filter: (path) => !path.endsWith(".map"),
})
console.log(`Static site ready: ${output}`)
