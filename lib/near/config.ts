import listed from './coins.json'

/**
 * ParallaxPay on NEAR mainnet: the vault, the coins it trades, and the Rhea pools between them.
 * Pool depths checked on 4 Nov 2026: USDC/wNEAR #4512 holds about $2M, wNEAR/ZEC #6065 about $250k,
 * and both price within 0.2% of Binance. Every other coin comes from scripts/near/discover.ts, which
 * lists each token with a classic Rhea pool against wNEAR or USDC that is deep enough and trades.
 */

// Public RPCs checked live on 4 Nov 2026.
export const NEAR_RPCS: string[] = [
  ...(process.env.NEXT_PUBLIC_NEAR_RPC ? [process.env.NEXT_PUBLIC_NEAR_RPC] : []),
  'https://free.rpc.fastnear.com',
  'https://near.drpc.org',
  'https://1rpc.io/near',
]

export const VAULT_ID = process.env.NEXT_PUBLIC_NEAR_VAULT ?? 'vault.parallaxpay.near'
export const AGENT_ID = process.env.NEXT_PUBLIC_NEAR_AGENT ?? 'agent.parallaxpay.near'
export const RHEA_ID = 'v2.ref-finance.near'
export const USDC_ID = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
export const WNEAR_ID = 'wrap.near'

/** What joining costs in yoctoNEAR (0.02 NEAR). The vault returns it when a member leaves. */
export const JOIN_DEPOSIT = '20000000000000000000000'
/** Gas for a vault trade: every step of the swap is paid for up front. */
export const TRADE_GAS = '300000000000000'

export type Token = { id: string; symbol: string; name: string; decimals: number }

export type Coin = Token & {
  /** From USDC to the coin, as listed in the vault. */
  path: string[]
  /** The Rhea pool for each hop of `path`. */
  pools: number[]
  /** Where the agent reads candles: Binance for coins listed there, the coin's own Rhea pool otherwise. */
  feed: { source: 'binance'; market: string } | { source: 'geckoterminal'; network: 'near'; pool: string }
  /** For the token list: what it is, in a few words. */
  blurb: string
  /** Its icon in public/tokens, when its metadata has one. */
  icon?: string
  /** Liquidity of the pool it trades through, and that pool's last-day volume and trades, in USD at discovery. */
  tvl?: number
  vol24?: number
  tx24?: number
}

type Listed = Omit<Coin, 'blurb'> & { whitelisted?: boolean }
const found = (listed as { coins: Listed[] }).coins
const facts = (id: string) => {
  const c = found.find(x => x.id === id)
  return c ? { icon: c.icon, tvl: c.tvl, vol24: c.vol24, tx24: c.tx24 } : {}
}

export const USDC: Token = { id: USDC_ID, symbol: 'USDC', name: 'USD Coin', decimals: 6 }

// The coins it started with, described by hand. Every coin is reachable from USDC through the
// USDC/wNEAR pool (#4512, about $2M deep). Coins without a Binance market are read from their own Rhea
// pool on GeckoTerminal.
const HAND: Coin[] = [
  { id: WNEAR_ID, symbol: 'NEAR', name: 'NEAR Protocol', decimals: 24, path: [USDC_ID, WNEAR_ID], pools: [4512], feed: { source: 'binance', market: 'NEARUSDT' }, blurb: 'The chain itself' },
  {
    id: 'zec.omft.near',
    symbol: 'ZEC',
    name: 'Zcash',
    decimals: 8,
    path: [USDC_ID, WNEAR_ID, 'zec.omft.near'],
    pools: [4512, 6065],
    feed: { source: 'binance', market: 'ZECUSDT' },
    blurb: 'Private money, bridged by NEAR Intents',
  },
  {
    id: 'token.rhealab.near',
    symbol: 'RHEA',
    name: 'Rhea',
    decimals: 18,
    path: [USDC_ID, WNEAR_ID, 'token.rhealab.near'],
    pools: [4512, 6458],
    feed: { source: 'geckoterminal', network: 'near', pool: 'refv1-6458' },
    blurb: 'NEAR’s main DEX and lending protocol',
  },
  {
    id: 'aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near',
    symbol: 'AURORA',
    name: 'Aurora',
    decimals: 18,
    path: [USDC_ID, WNEAR_ID, 'aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near'],
    pools: [4512, 5469],
    feed: { source: 'geckoterminal', network: 'near', pool: 'refv1-5469' },
    blurb: 'The EVM that runs on NEAR',
  },
]
const CORE: Coin[] = HAND.map(c => ({ ...c, ...facts(c.id) }))

/** Every coin it can trade: the four above, then every other coin discovery found, busiest first. */
export const COINS: Coin[] = [
  ...CORE,
  ...found
    .filter(c => !CORE.some(k => k.id === c.id))
    .map(({ whitelisted: _w, ...c }): Coin => ({ ...c, blurb: '' })),
]

/** The coins the app opens on: the four it started with. */
export const CORE_SYMBOLS = CORE.map(c => c.symbol)

/** Where a coin's candles come from, as the market loaders take it. */
export const assetOf = (c: Coin) =>
  c.feed.source === 'binance'
    ? ({ symbol: c.symbol, source: 'binance', market: c.feed.market } as const)
    : ({ symbol: c.symbol, source: 'geckoterminal', network: c.feed.network, pool: c.feed.pool, token: c.id } as const)

/** The candle source in words, for plans and the analyst: "Binance NEARUSDT" or "Rhea pool 6458". */
export const feedName = (c: Coin) => (c.feed.source === 'binance' ? `Binance ${c.feed.market}` : `Rhea pool ${c.feed.pool.replace('refv1-', '')}`)

export const TOKENS: Token[] = [USDC, ...COINS]

export const tokenById = (id: string): Token | undefined => TOKENS.find(t => t.id === id)
export const coinById = (id: string): Coin | undefined => COINS.find(c => c.id === id)
export const coinBySymbol = (symbol: string): Coin | undefined => COINS.find(c => c.symbol === symbol)

export const nearTxUrl = (hash: string) => `https://nearblocks.io/txns/${hash}`
export const nearAccountUrl = (id: string) => `https://nearblocks.io/address/${id}`
