import type { NextConfig } from 'next'

// Static export: the app is local-first (no server, no accounts until P7).
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
}

export default nextConfig
