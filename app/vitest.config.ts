import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Tests that render the whole app take half a second or so each, and there
// are hundreds, so they're a project of their own that `npm test` leaves out:
// every test file that renders <App>.
const src = fileURLToPath(new URL("src", import.meta.url))
const appTests = readdirSync(src, { recursive: true, encoding: "utf8" })
  .filter(
    (file) =>
      file.endsWith(".test.tsx") &&
      /<App\b/.test(readFileSync(`${src}/${file}`, "utf8")),
  )
  .map((file) => `src/${file.replaceAll("\\", "/")}`)

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // rendering the whole app in jsdom is slow, and every test does it
    testTimeout: 20000,
    // each test file gets a fresh context in a worker kept for the next,
    // rather than a new process loading jsdom and the app again
    pool: "vmThreads",
    // a project's include is added to the root's, so the root has none
    projects: [
      {
        extends: true,
        test: {
          name: "quick",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: appTests,
        },
      },
      { extends: true, test: { name: "whole-app", include: appTests } },
    ],
  },
})
