import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react({ jsxImportSource: "@emotion/react" })],
  build: {
    sourcemap: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
})
