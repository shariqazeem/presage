import { createPublicClient, fallback, http, type Address, type Chain } from 'viem'
import { metis, metisSepolia } from 'viem/chains'
import { deployments, type Deployment } from './deployments'

// Public RPCs checked live on 14 Oct 2026. The BlastAPI endpoint in Metis's docs is dead.
const ANDROMEDA_RPCS = [
  'https://andromeda.metis.io/?owner=1088',
  'https://metis-rpc.publicnode.com',
  'https://metis.drpc.org',
]
const SEPOLIA_RPCS = ['https://sepolia.metisdevops.link', 'https://metis-sepolia-rpc.publicnode.com']

export type Network = 'metis' | 'metis-sepolia'

export const NETWORK: Network = process.env.NEXT_PUBLIC_PRESAGE_NETWORK === 'metis-sepolia' ? 'metis-sepolia' : 'metis'

export const chain: Chain = NETWORK === 'metis' ? metis : metisSepolia
export const isMainnet = NETWORK === 'metis'

export const rpcUrls: string[] = (() => {
  const custom = process.env.NEXT_PUBLIC_PRESAGE_RPC_URL
  const base = isMainnet ? ANDROMEDA_RPCS : SEPOLIA_RPCS
  // A rehearsal on a local fork must never fall back to a public RPC.
  if (custom && process.env.NEXT_PUBLIC_PRESAGE_RPC_ONLY === '1') return [custom]
  return custom ? [custom, ...base] : base
})()

export const explorerUrl = isMainnet ? 'https://andromeda-explorer.metis.io' : 'https://sepolia-explorer.metisdevops.link'

export const txUrl = (hash: string) => `${explorerUrl}/tx/${hash}`
export const addressUrl = (address: string) => `${explorerUrl}/address/${address}`

export const deployment: Deployment | undefined = deployments[chain.id]

// ERC-8004 v2.0.0 canonical registries
export const erc8004 = isMainnet
  ? {
      identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address,
      reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as Address,
    }
  : {
      identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
      reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as Address,
    }

export const NATIVE = '0x0000000000000000000000000000000000000000' as Address

export type PayToken = { address: Address; symbol: string; decimals: number; native: boolean }

export const payTokens: PayToken[] = isMainnet
  ? [
      { address: NATIVE, symbol: 'METIS', decimals: 18, native: true },
      { address: '0xEA32A96608495e54156Ae48931A7c20f0dcc1a21', symbol: 'm.USDC', decimals: 6, native: false },
      { address: '0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC', symbol: 'm.USDT', decimals: 6, native: false },
    ]
  : [
      { address: NATIVE, symbol: 'tMETIS', decimals: 18, native: true },
      ...(deployment?.stables ?? []).map(address => ({ address, symbol: 'tUSD', decimals: 6, native: false })),
    ]

export const publicClient = createPublicClient({
  chain,
  transport: fallback(rpcUrls.map(url => http(url, { timeout: 15_000, retryCount: 1 }))),
})

/** CAIP-2 id used in x402 payment requirements and ERC-8004 registration files. */
export const caip2 = `eip155:${chain.id}`
