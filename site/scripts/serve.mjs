import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { createServer } from "node:net"

const require = createRequire(import.meta.url)
const nextCli = require.resolve("next/dist/bin/next")
const preferredPort = 3001
const portsToTry = 50

const availableOn = (port, host) => new Promise((resolve) => {
  const probe = createServer()
  probe.once("error", () => resolve(false))
  probe.once("listening", () => probe.close(() => resolve(true)))
  probe.listen({ port, host, exclusive: true })
})

// Windows can bind IPv4 and IPv6 separately. The chosen port must be free on
// both so localhost reaches this server regardless of address-family order.
const findPort = async () => {
  if (process.env.PORT !== undefined) {
    const requested = Number(process.env.PORT)
    if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
      throw new Error("PORT must be a number from 1 to 65535")
    }
    return requested
  }
  for (let port = preferredPort; port < preferredPort + portsToTry; port++) {
    if (await availableOn(port, "0.0.0.0") && await availableOn(port, "::")) {
      return port
    }
  }
  throw new Error(`No available port from ${preferredPort} to ${preferredPort + portsToTry - 1}`)
}

const mode = process.argv[2]
if (mode !== "dev" && mode !== "start") {
  throw new Error("Usage: node scripts/serve.mjs <dev|start>")
}

const port = await findPort()
console.log(`PUNCHER support: using http://localhost:${port}`)
const child = spawn(process.execPath, [nextCli, mode, "--port", String(port), ...process.argv.slice(3)], {
  stdio: "inherit",
  env: process.env,
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal))
}

child.on("error", (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1)
})
