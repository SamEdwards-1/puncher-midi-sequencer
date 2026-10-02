import { createServer } from "node:net"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { bundleBudget } from "./scripts/bundleBudget.ts"

// the app's own types are the browser's; the dev server needs PORT
declare const process: { env: Record<string, string | undefined> }

const DEFAULT_PORT = 3000
const PORTS_TO_TRY = 50

/**
 * Whether a port is free on one address.
 *
 * Windows keeps the two address families apart: a server on the IPv6
 * wildcard doesn't stop a bind on IPv4. Vite checks one of them, so a port
 * another program already answers on can look free, and two servers end up
 * claiming it — with the browser reaching whichever one localhost resolves
 * to. A port only counts as free here when it is free on both.
 */
const isFree = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const probe = createServer()
    probe.once("error", () => resolve(false))
    probe.once("listening", () => probe.close(() => resolve(true)))
    probe.listen({ port, host, exclusive: true })
  })

const findPort = async (from: number): Promise<number> => {
  for (let port = from; port < from + PORTS_TO_TRY; port++) {
    if ((await isFree(port, "0.0.0.0")) && (await isFree(port, "::"))) {
      return port
    }
  }
  return from
}

export default defineConfig(async () => {
  // A port handed to us is used exactly as given: whatever set it is about to
  // open a browser there. Ours is only a preference.
  const chosen = process.env.PORT
  const port =
    chosen === undefined ? await findPort(DEFAULT_PORT) : Number(chosen)

  return {
    plugins: [
      react(),
      tailwindcss(),
      // The async step coordinator adds a small main-thread cost while its
      // simulation and MIDI work stay in a separate worker bundle.
      bundleBudget({
        initial: { bytes: 815_000, gzip: 253_000 },
        notInitial: [
          "@breezystack/lamejs",
          "wav-encoder",
          "spessasynth_core",
          "spessasynth_lib",
          "stb-vorbis",
        ],
        files: { "renderAudio.worker": 480_000 },
      }),
    ],
    build: {
      sourcemap: true,
    },
    worker: {
      // an ES module worker can split off the code only some renders need,
      // which an IIFE one, the default, inlines back into itself
      format: "es" as const,
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
      // only the render worker and what it loads import these, and the
      // dependency scan doesn't follow workers: left to be found when the
      // first render starts, they're optimized then and the page reloaded
      // under it
      include: ["spessasynth_core", "wav-encoder", "@breezystack/lamejs"],
    },
  }
})
