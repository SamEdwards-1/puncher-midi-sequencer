import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { test } from "node:test"
import { docs } from "./load-docs.mjs"

test("guide URLs and section anchors are unique and safe", () => {
  assert.equal(new Set(docs.map(({ slug }) => slug)).size, docs.length)
  for (const doc of docs) {
    assert.match(doc.slug, /^[a-z0-9-]+$/)
    assert.equal(new Set(doc.sections.map(({ id }) => id)).size, doc.sections.length)
    for (const section of doc.sections) assert.match(section.id, /^[a-z0-9-]+$/)
  }
})

test("guide references and screenshot files resolve", () => {
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.image) {
        assert.ok(existsSync(new URL(`../public/screenshots/${section.image}`, import.meta.url)), `${doc.slug}: missing ${section.image}`)
        assert.ok(section.caption, `${doc.slug}: missing image description`)
      }
      for (const match of section.body.matchAll(/\]\(\/docs\/([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/g)) {
        const target = docs.find(({ slug }) => slug === match[1])
        assert.ok(target, `${doc.slug}: broken guide ${match[1]}`)
        if (match[2]) assert.ok(target.sections.some(({ id }) => id === match[2]), `Broken anchor ${match[2]}`)
      }
    }
  }
})
