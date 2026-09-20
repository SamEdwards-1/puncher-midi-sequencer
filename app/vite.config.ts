import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// no @types/node in this workspace; the dev server only needs PORT
declare const process: { env: Record<string, string | undefined> }

const port = process.env.PORT ? Number(process.env.PORT) : 3000

export default defineConfig({
  plugins: [react({ jsxImportSource: "@emotion/react" })],
  build: {
    sourcemap: true,
  },
  server: {
    port,
    strictPort: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // the core package is workspace source; pre-bundling it serves stale
    // copies after it changes
    exclude: ["@midiseq/core"],
  },
})
