/**
 * Strings with blanks to fill, in a small part of ICU MessageFormat, so that
 * each language puts the numbers and names where its own word order wants
 * them:
 *
 * - `{name}` is the value given for `name`.
 * - `{count, plural, one {# note} other {# notes}}` picks a branch by the
 *   language's plural rules (`zero`, `one`, `two`, `few`, `many`, `other`,
 *   or `=2` for exactly 2), and `#` in it is the count. A language without
 *   plurals writes the one form, with no `plural` at all.
 *
 * Apostrophes are plain text, not ICU's quoting, and `#` is only the count
 * inside a plural's branch.
 */

export type Values = Record<string, string | number>

// whole numbers as they are, "1234 notes" not "1,234"; fractions with the
// language's decimal mark, "1,5" in French
const number = (language: string, value: number) =>
  Number.isInteger(value) ? String(value) : value.toLocaleString(language)

// where the brace at `open` closes, or -1 if it doesn't
const closing = (text: string, open: number) => {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === "{") {
      depth++
    } else if (text[index] === "}" && --depth === 0) {
      return index
    }
  }
  return -1
}

const PLURAL = /^\s*(\w+)\s*,\s*plural\s*,/
const BRANCH = /\s*(=\d+|zero|one|two|few|many|other)\s*\{/y

// a plural's branches, by what picks them: "one", "other", "=0"
const branchesOf = (choices: string) => {
  const branches = new Map<string, string>()
  let index = 0
  for (;;) {
    BRANCH.lastIndex = index
    const match = BRANCH.exec(choices)
    if (match === null) {
      return branches
    }
    const open = index + match[0].length - 1
    const end = closing(choices, open)
    if (end === -1) {
      return branches
    }
    branches.set(match[1], choices.slice(open + 1, end))
    index = end + 1
  }
}

// what one pair of braces holds becomes, or undefined to leave it be
const placeholder = (
  language: string,
  inner: string,
  values: Values,
): string | undefined => {
  const plural = PLURAL.exec(inner)
  if (plural === null) {
    const value = values[inner.trim()]
    return typeof value === "number" ? number(language, value) : value
  }
  const count = Number(values[plural[1]])
  const branches = branchesOf(inner.slice(plural[0].length))
  const branch =
    branches.get(`=${count}`) ??
    branches.get(new Intl.PluralRules(language).select(count)) ??
    branches.get("other") ??
    ""
  return fill(language, branch, values, number(language, count))
}

const fill = (
  language: string,
  template: string,
  values: Values,
  hash?: string,
): string => {
  let filled = ""
  for (let index = 0; index < template.length; index++) {
    const char = template[index]
    if (char === "#" && hash !== undefined) {
      filled += hash
    } else if (char !== "{") {
      filled += char
    } else {
      const end = closing(template, index)
      if (end === -1) {
        return filled + template.slice(index)
      }
      filled +=
        placeholder(language, template.slice(index + 1, end), values) ??
        template.slice(index, end + 1)
      index = end
    }
  }
  return filled
}

/** The template with its blanks filled, in `language`'s plural rules. */
export const format = (
  language: string,
  template: string,
  values: Values = {},
): string => fill(language, template, values)

/**
 * What a template is given — the names in its `{name}`s and its plurals'
 * counts — which of them it shows (a count only picking a branch isn't
 * shown, a `#` is), and the plural branches it chooses between: for
 * checking a translation against the English.
 */
export const templateParts = (template: string) => {
  const names = new Set<string>()
  const shown = new Set<string>()
  const branches = new Set<string>()
  const walk = (text: string) => {
    for (let index = 0; index < text.length; index++) {
      if (text[index] !== "{") {
        continue
      }
      const end = closing(text, index)
      if (end === -1) {
        return
      }
      const inner = text.slice(index + 1, end)
      const plural = PLURAL.exec(inner)
      if (plural === null) {
        names.add(inner.trim())
        shown.add(inner.trim())
      } else {
        names.add(plural[1])
        for (const [key, branch] of branchesOf(inner.slice(plural[0].length))) {
          branches.add(key)
          if (branch.includes("#")) {
            shown.add(plural[1])
          }
          walk(branch)
        }
      }
      index = end
    }
  }
  walk(template)
  return { names, shown, branches }
}
