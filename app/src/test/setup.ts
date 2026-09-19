import "@testing-library/jest-dom/vitest"
import { configure } from "mobx"
import { beforeAll } from "vitest"

// Match the app's MobX configuration in src/index.tsx
configure({
  enforceActions: "never",
})

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, "language", {
    value: "en",
    writable: true,
  })
})
