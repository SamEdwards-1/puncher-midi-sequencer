import { describe, expect, it } from "vitest"
import en from "./en"
import { format, templateParts } from "./format"
import localization, { LANGUAGE_ALIASES, LANGUAGES } from "./localization"

describe("format", () => {
  it("fills in the blanks", () => {
    expect(
      format("en", "Fills steps {first}–{last} of {total}", {
        first: 1,
        last: 8,
        total: 16,
      }),
    ).toBe("Fills steps 1–8 of 16")
  })

  it("leaves a blank it isn't given", () => {
    expect(format("en", "Remove {name}")).toBe("Remove {name}")
  })

  it("picks a plural by the language's rules", () => {
    const notes = "{count, plural, one {# note} other {# notes}}"
    expect(format("en", notes, { count: 1 })).toBe("1 note")
    expect(format("en", notes, { count: 0 })).toBe("0 notes")
    expect(format("en", notes, { count: 4 })).toBe("4 notes")
    // French counts 0 as one
    expect(
      format("fr", "{n, plural, one {# note} other {# notes}}", { n: 0 }),
    ).toBe("0 note")
    const kroky = "{n, plural, one {# krok} few {# kroky} other {# krokov}}"
    expect(format("sk", kroky, { n: 1 })).toBe("1 krok")
    expect(format("sk", kroky, { n: 3 })).toBe("3 kroky")
    expect(format("sk", kroky, { n: 5 })).toBe("5 krokov")
  })

  it("prefers an exact match, and falls back to other", () => {
    const steps = "{n, plural, =0 {no steps} one {# step} other {# steps}}"
    expect(format("en", steps, { n: 0 })).toBe("no steps")
    expect(format("ja", steps, { n: 1 })).toBe("1 steps")
  })

  it("fills blanks inside a plural's branch", () => {
    const on = "{count, plural, one {On step {steps}} other {On steps {steps}}}"
    expect(format("en", on, { count: 2, steps: "5, 9" })).toBe("On steps 5, 9")
  })

  it("writes fractions with the language's decimal mark", () => {
    expect(format("en", "round {times}×", { times: 1.5 })).toBe("round 1.5×")
    expect(format("fr", "tour {times}×", { times: 1.5 })).toBe("tour 1,5×")
    expect(format("en", "{n} notes", { n: 1234 })).toBe("1234 notes")
  })
})

describe("languages", () => {
  const pluralCategories = (language: string) =>
    new Set<string>(
      new Intl.PluralRules(language).resolvedOptions().pluralCategories,
    )

  describe.each(
    LANGUAGES.filter((language) => language !== "en"),
  )("%s", (language) => {
    const table: Record<string, string> = localization[language]

    it("has every English key, and no others", () => {
      expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort())
    })

    // A count the English only picks a plural by needn't be in a
    // language without plurals, but everything the English shows must be,
    // and nothing it isn't given.
    it("fills the same blanks as the English", () => {
      const wrong = Object.entries(en).filter(([key, english]) => {
        const given = templateParts(english)
        const used = templateParts(table[key])
        return (
          [...given.shown].some((name) => !used.shown.has(name)) ||
          [...used.names].some((name) => !given.names.has(name))
        )
      })
      expect(wrong.map(([key]) => key)).toEqual([])
    })

    it("chooses only between plurals the language has", () => {
      const categories = pluralCategories(language)
      const wrong = Object.entries(table).filter(([, text]) => {
        const { branches } = templateParts(text)
        return (
          (branches.size > 0 && !branches.has("other")) ||
          [...branches].some(
            (branch) => !branch.startsWith("=") && !categories.has(branch),
          )
        )
      })
      expect(wrong.map(([key]) => key)).toEqual([])
    })

    it("leaves nothing empty", () => {
      expect(
        Object.entries(table)
          .filter(([, text]) => text.trim() === "")
          .map(([key]) => key),
      ).toEqual([])
    })
  })

  it("knows each language by the browser's tags for it", () => {
    const languageOf = (tag: string) =>
      LANGUAGE_ALIASES.find(([alias]) => alias.test(tag))?.[1] ?? null
    expect(languageOf("en-US")).toBe("en")
    expect(languageOf("fr-CA")).toBe("fr")
    expect(languageOf("sk-SK")).toBe("sk")
    expect(languageOf("ja-JP")).toBe("ja")
    expect(languageOf("zh-CN")).toBe("zh-Hans")
    expect(languageOf("zh-Hans-HK")).toBe("zh-Hans")
    expect(languageOf("zh")).toBe("zh-Hans")
    expect(languageOf("zh-TW")).toBe(null)
    expect(languageOf("zh-Hant")).toBe(null)
    expect(languageOf("de-DE")).toBe(null)
  })
})
