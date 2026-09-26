// Makes one of our themes from a VS Code colour theme. From the repository
// root or from app/:
//
//   npm run theme -- path/to/theme.json [--name Name] [--id id] [--type dark|light] [--drama 0-1]
//     [--accent key-or-colour] [--tint key-or-colour]
//     [--voices key-or-colour,…] [--background key-or-colour]
//     [--set name=key-or-colour]…
//   npm run theme -- --all
//
// It writes src/theme/themes/<id>.css, keeps the VS Code theme beside it as
// <id>.vscode.json so the theme can be made again, and lists it in
// src/theme/themes/themes.json, which Settings reads. --all makes every
// listed theme again from those copies: after a colour is added to the
// built-in themes, say, or the utility learns something new.
//
// Node runs it as it is, types and all (22.18 or later).

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  builtInPalettes,
  commentedColours,
  parseJSONC,
  type ThemeKind,
  themeCSS,
  themeFromVSCode,
} from "../src/theme/fromVSCode.ts"

type Listed = {
  id: string
  name: string
  type: ThemeKind
  drama?: number
  accent?: string
  tint?: string
  voices?: string[]
  background?: string
  set?: Record<string, string>
}

const app = resolve(import.meta.dirname, "..")
const folder = resolve(app, "src/theme/themes")
const listPath = resolve(folder, "themes.json")
const BUILT_IN = ["dark", "light"]

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const readList = (): Listed[] =>
  existsSync(listPath) ? JSON.parse(readFileSync(listPath, "utf8")) : []

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// "night-owl-color-theme.json" → "Night Owl"
const nameFromFile = (path: string) =>
  basename(path)
    .replace(/\.jsonc?$/i, "")
    .replace(/[-_.]?colou?r[-_.]?theme$/i, "")
    .split(/[-_.\s]+/)
    .filter((word) => word !== "")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")

const make = (
  source: string,
  wanted: {
    name?: string
    id?: string
    type?: ThemeKind
    drama?: number
    accent?: string
    tint?: string
    voices?: string[]
    background?: string
    set?: Record<string, string>
  },
) => {
  const text = readFileSync(source, "utf8")
  let json: unknown
  try {
    json = parseJSONC(text)
  } catch (error) {
    return fail(`${source} isn't JSON: ${(error as Error).message}`)
  }
  const own = (json as { name?: unknown }).name
  const name =
    wanted.name ?? (typeof own === "string" ? own : nameFromFile(source))
  const id = wanted.id ?? slug(name)
  if (id === "") {
    return fail("The theme needs a name with a letter or digit in it: --name.")
  }
  if (BUILT_IN.includes(id)) {
    return fail(`"${id}" is a built-in theme; give this one another --id.`)
  }

  const bases = builtInPalettes(
    readFileSync(resolve(app, "src/theme/layout.css"), "utf8"),
  )
  const theme = themeFromVSCode(json, bases, {
    type: wanted.type,
    commented: commentedColours(text),
    drama: wanted.drama,
    accent: wanted.accent,
    tint: wanted.tint,
    voices: wanted.voices,
    background: wanted.background,
    set: wanted.set,
  })

  writeFileSync(resolve(folder, `${id}.css`), themeCSS(id, name, theme))
  const copy = resolve(folder, `${id}.vscode.json`)
  if (resolve(source) !== copy) {
    writeFileSync(copy, text)
  }
  const list = readList().filter((listed) => listed.id !== id)
  list.push({
    id,
    name,
    type: theme.type,
    ...(wanted.drama ? { drama: wanted.drama } : {}),
    ...(wanted.accent ? { accent: wanted.accent } : {}),
    ...(wanted.tint ? { tint: wanted.tint } : {}),
    ...(wanted.voices ? { voices: wanted.voices } : {}),
    ...(wanted.background ? { background: wanted.background } : {}),
    ...(wanted.set ? { set: wanted.set } : {}),
  })
  list.sort((one, other) => one.name.localeCompare(other.name))
  writeFileSync(listPath, `${JSON.stringify(list, null, 2)}\n`)

  const width = Math.max(...theme.colours.map(({ name }) => name.length))
  console.log(`\n${name} (${id}), ${theme.type}:`)
  for (const colour of theme.colours) {
    console.log(
      `  ${colour.name.padEnd(width)}  ${colour.value.padEnd(9)}  ${colour.source}`,
    )
  }
  for (const note of theme.notes) {
    console.log(`  Note: ${note}`)
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    id: { type: "string" },
    type: { type: "string" },
    drama: { type: "string" },
    accent: { type: "string" },
    tint: { type: "string" },
    voices: { type: "string" },
    background: { type: "string" },
    set: { type: "string", multiple: true },
    all: { type: "boolean" },
  },
})

if (values.type !== undefined && !BUILT_IN.includes(values.type)) {
  fail("--type is dark or light.")
}

// --set name=key-or-colour, as often as wanted: any of our colours outright
function sets(given: string[] | undefined) {
  if (given === undefined) {
    return undefined
  }
  return Object.fromEntries(
    given.map((pair) => {
      const at = pair.indexOf("=")
      if (at < 1) {
        fail(`--set takes name=key-or-colour, not ${pair}.`)
      }
      return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()]
    }),
  )
}

// --drama 0–1: how far to push the grid's steps and the backgrounds
function drama(text: string | undefined) {
  if (text === undefined) {
    return undefined
  }
  const amount = Number(text)
  if (!(amount >= 0 && amount <= 1)) {
    fail("--drama is a number from 0 to 1.")
  }
  return amount
}

if (values.all) {
  for (const listed of readList()) {
    make(resolve(folder, `${listed.id}.vscode.json`), listed)
  }
} else if (positionals.length === 1) {
  // npm runs this from app/; a path is as typed where npm was run
  const from = process.env.INIT_CWD ?? process.cwd()
  make(resolve(from, positionals[0]), {
    name: values.name,
    id: values.id,
    type: values.type as ThemeKind | undefined,
    drama: drama(values.drama),
    accent: values.accent,
    tint: values.tint,
    voices: values.voices?.split(",").map((voice) => voice.trim()),
    background: values.background,
    set: sets(values.set),
  })
  console.log("\nChoose it in Settings → Theme.")
} else {
  fail(
    "Usage: npm run theme -- <vscode-theme.json> [--name Name] [--id id] [--type dark|light]\n" +
      "       npm run theme -- --all",
  )
}
