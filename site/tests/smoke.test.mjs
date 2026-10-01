import assert from "node:assert/strict"
import { test } from "node:test"
import { docs } from "./load-docs.mjs"

// Start the built site first. Override SITE_TEST_URL to use another port.
const base = process.env.SITE_TEST_URL || "http://localhost:3001"

test("every guide serves its title, section anchors, and internal links", async () => {
  const routes = new Set(["/", ...docs.map(({ slug }) => `/docs/${slug}`)])
  for (const route of routes) {
    const response = await fetch(`${base}${route}`)
    assert.equal(response.status, 200, route)
    const html = await response.text()
    assert.match(html, /<main[^>]*id="main"/)
    assert.match(html, /<h1[ >]/)
    const doc = docs.find(({ slug }) => route === `/docs/${slug}`)
    for (const section of doc?.sections || []) assert.ok(html.includes(`id="${section.id}"`), `${route}#${section.id}`)
    for (const [, href] of html.matchAll(/href="(\/[^"?]*)"/g)) {
      if (href.startsWith("/_next") || href.startsWith("/icon.svg")) continue
      assert.ok(routes.has(href.split("#")[0]), `${route} links to unknown route ${href}`)
    }
  }
})

test("unknown guide returns a real 404", async () => {
  assert.equal((await fetch(`${base}/docs/this-guide-does-not-exist`)).status, 404)
})

test("documented screenshots are served", async () => {
  const images = new Set(docs.flatMap(({ sections }) => sections.flatMap(({ image }) => image ? [image] : [])))
  for (const image of images) {
    const response = await fetch(`${base}/screenshots/${image}`)
    assert.equal(response.status, 200, image)
    assert.match(response.headers.get("content-type") || "", /image\/png/)
  }
})
