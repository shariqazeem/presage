import { USDC_ID } from './config'

/**
 * NEAR Intents through its 1-Click API: someone sends a coin on its own chain to a one-time deposit
 * address, and solvers deliver USDC to their NEAR account. ParallaxPay uses it to bring funds to NEAR.
 */

export const ONE_CLICK = process.env.ONECLICK_BASE_URL ?? 'https://1click.chaindefuser.com'
export const DESTINATION_ASSET = `nep141:${USDC_ID}`

/** The coins we offer to bring in, by 1-Click asset id. */
export const ORIGINS = [
  { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', chain: 'Base', decimals: 6 },
  { assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', symbol: 'USDC', chain: 'Ethereum', decimals: 6 },
  { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', chain: 'Solana', decimals: 6 },
  { assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', symbol: 'USDC', chain: 'Arbitrum', decimals: 6 },
  { assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', symbol: 'USDT', chain: 'Ethereum', decimals: 6 },
  { assetId: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near', symbol: 'USDT', chain: 'Tron', decimals: 6 },
  { assetId: 'nep141:eth.omft.near', symbol: 'ETH', chain: 'Ethereum', decimals: 18 },
  { assetId: 'nep141:base.omft.near', symbol: 'ETH', chain: 'Base', decimals: 18 },
  { assetId: 'nep141:sol.omft.near', symbol: 'SOL', chain: 'Solana', decimals: 9 },
  { assetId: 'nep141:btc.omft.near', symbol: 'BTC', chain: 'Bitcoin', decimals: 8 },
] as const

export type Origin = (typeof ORIGINS)[number]

export type IntentQuote = {
  quote: {
    amountIn: string
    amountInFormatted: string
    amountInUsd?: string
    amountOut: string
    amountOutFormatted: string
    minAmountOut: string
    timeEstimate: number
    depositAddress?: string
    depositMemo?: string
    deadline?: string
  }
  correlationId?: string
}

export type IntentStatus = {
  status: 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED'
  swapDetails?: { amountOutFormatted?: string; destinationChainTxHashes?: { hash: string; explorerUrl?: string }[]; originChainTxHashes?: { hash: string; explorerUrl?: string }[] }
}

export const oneClickHeaders = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...(process.env.ONECLICK_JWT ? { authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}),
})
