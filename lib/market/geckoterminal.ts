import type { Candle } from './types'

// GeckoTerminal's public API: DEX pools on BSC and X Layer. No key, but the free tier throttles hard,
// so every request goes through one queue that spaces calls out and backs off on 429.
const BASE = 'https://api.geckoterminal.com/api/v2'
const MIN_GAP_MS = Number(process.env.GT_MIN_GAP_MS ?? 2600)

let chain: Promise<unknown> = Promise.resolve()
let last = 0

async function gt<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = last + MIN_GAP_MS - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      last = Date.now()
      const res = await fetch(`${BASE}${path}`, {
        headers: { accept: 'application/json;version=20230302' },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      })
      if (res.ok) return (await res.json()) as T
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 5_000 * 2 ** attempt))
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
