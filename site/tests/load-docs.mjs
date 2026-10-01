import { readFile } from "node:fs/promises"
import ts from "typescript"

// Keep the tests compatible with the repository's Node 20 baseline.
const source = await readFile(new URL("../lib/docs.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
export const { docs } = await import(moduleUrl)
