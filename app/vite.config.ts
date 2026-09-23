import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// no @types/node in this workspace; the dev server only needs PORT
declare const process: { env: Record<string, string | undefined> }

// A port handed to us has to be used exactly: whatever set it is about to
// open a browser there. Our own 3000 is only a preference — Signal's dev
// server often has it — so Vite walks up to the next free one instead of
// refusing to start.
const chosen = process.env.PORT
const port = chosen === undefined ? 3000 : Number(chosen)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: true,
  },
  server: {
    port,
    strictPort: chosen !== undefined,
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
