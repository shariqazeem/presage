import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // A stray lockfile in the home folder otherwise makes Next guess the wrong workspace root.
  outputFileTracingRoot: process.cwd(),
  // Native modules stay on the server and out of the bundle.
  serverExternalPackages: ['better-sqlite3', '@resvg/resvg-js'],
  eslint: { ignoreDuringBuilds: true },
  // WalletConnect pulls optional server-only packages that the browser build never needs.
  // The Base Account connector also imports Coinbase's optional x402 SDKs, which Presage does not use.
  webpack: config => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core/client': false,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/svm/exact/client': false,
    }
    return config
  },
}

export default nextConfig
