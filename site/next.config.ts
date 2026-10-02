import type { NextConfig } from "next"

const config: NextConfig = {
  poweredByHeader: false,
  output: "export",
  images: { unoptimized: true },
}

export default config
