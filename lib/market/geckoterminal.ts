import type { Candle } from './types'

// GeckoTerminal's DEX data: pools on BSC and X Layer. Without a key the public API allows only a few
// requests a minute from one IP, so every request goes through one queue that spaces calls out and
// backs off on 429. With a free CoinGecko demo key the same data comes from CoinGecko's on-chain API,
// which allows 30 a minute.
const KEY = process.env.COINGECKO_API_KEY
const BASE = KEY ? 'https://api.coingecko.com/api/v3/onchain' : 'https://api.geckoterminal.com/api/v2'
/** Pools ST Quant can afford to watch at this source's rate limit. */
export const GT_POOL_BUDGET = KEY ? 24 : 12

// The gap between requests adapts: it widens on every 429 and narrows slowly after a run of successes,
// so it settles just under whatever limit applies to this IP.
const FLOOR_MS = KEY ? 2_100 : 2_500
let gapMs = Number(process.env.GT_MIN_GAP_MS ?? (KEY ? 2_100 : 12_000))
let okStreak = 0
let chain: Promise<unknown> = Promise.resolve()
let last = 0

async function gt<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const wait = last + gapMs - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      last = Date.now()
      const res = await fetch(`${BASE}${path}`, {
        headers: KEY ? { accept: 'application/json', 'x-cg-demo-api-key': KEY } : { accept: 'application/json;version=20230302' },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      })
      if (process.env.GT_DEBUG) console.log(`${new Date().toISOString()} GT ${res.status} gap=${gapMs} ${path.slice(0, 80)}`)
      if (res.ok) {
        if (++okStreak >= 10) {
          gapMs = Math.max(FLOOR_MS, Math.round(gapMs * 0.9))
          okStreak = 0
        }
        return (await res.json()) as T
      }
      if (res.status === 429 || res.status >= 500) {
        okStreak = 0
        if (res.status === 429) gapMs = Math.min(30_000, Math.round(gapMs * 1.5))
        continue
      }
      throw new Error(`GeckoTerminal ${res.status} for ${path}`)
    }
    throw new Error(`GeckoTerminal kept throttling ${path}`)
  }
  const p = chain.then(run, run)
  chain = p.catch(() => undefined)
  return p
}

export type Pool = {
  network: string
  pool: string
  name: string
  baseToken: string
  baseSymbol: string
  liquidityUsd: number
  volume24hUsd: number
  change24hPct: number
  createdAt: number
}

type PoolResp = {
  data: {
    attributes: {
      address: string
      name: string
      reserve_in_usd: string
      volume_usd: { h24: string }
      price_change_percentage: { h24: string }
      pool_created_at: string
    }
    relationships: { base_token: { data: { id: string } } }
  }[]
}

function toPools(network: string, r: PoolResp): Pool[] {
  return r.data.map(d => {
    const a = d.attributes
    const baseId = d.relationships.base_token.data.id // "<network>_<address>"
    return {
      network,
      pool: a.address,
      name: a.name,
      baseToken: baseId.slice(baseId.indexOf('_') + 1),
      baseSymbol: a.name.split('/')[0].trim(),
      liquidityUsd: Number(a.reserve_in_usd),
      volume24hUsd: Number(a.volume_usd.h24),
      change24hPct: Number(a.price_change_percentage.h24),
      createdAt: Date.parse(a.pool_created_at) / 1000,
    }
  })
}

export async function trendingPools(network: string): Promise<Pool[]> {
  return toPools(network, await gt<PoolResp>(`/networks/${network}/trending_pools?page=1`))
}

export async function topPools(network: string): Promise<Pool[]> {
  return toPools(network, await gt<PoolResp>(`/networks/${network}/pools?page=1&sort=h24_volume_usd_desc`))
}

/** Candles oldest first. GeckoTerminal returns at most 1000 per request. */
export async function poolOhlcv(
  network: string,
  pool: string,
  timeframe: 'minute' | 'hour' | 'day',
  aggregate: number,
  opts: { limit?: number; beforeSec?: number } = {},
): Promise<Candle[]> {
  const q = new URLSearchParams({ aggregate: String(aggregate), limit: String(opts.limit ?? 1000), currency: 'usd' })
  if (opts.beforeSec) q.set('before_timestamp', String(opts.beforeSec))
  const r = await gt<{ data: { attributes: { ohlcv_list: number[][] } } }>(
    `/networks/${network}/pools/${pool}/ohlcv/${timeframe}?${q}`,
  )
  return r.data.attributes.ohlcv_list
    .map(([t, o, h, l, c, v]) => ({ ts: t * 1000, o, h, l, c, v }))
    .sort((a, b) => a.ts - b.ts)
}
