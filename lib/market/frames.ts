import { binanceKlines } from './binance'
import { poolOhlcv } from './geckoterminal'
import { TF_MS, assetKey, type AssetRef, type Candle, type Frames } from './types'

/**
 * Merge candles into a larger timeframe with buckets aligned to UTC. A first bucket that starts
 * part-way through is dropped; the last bucket may still be forming, like any live candle.
 */
export function aggregate(candles: Candle[], toMs: number): Candle[] {
  const out: Candle[] = []
  for (const k of candles) {
    const bucket = Math.floor(k.ts / toMs) * toMs
    const cur = out.at(-1)
    if (cur && cur.ts === bucket) {
      cur.h = Math.max(cur.h, k.h)
      cur.l = Math.min(cur.l, k.l)
      cur.c = k.c
      cur.v += k.v
    } else if (out.length > 0 || k.ts === bucket) {
      out.push({ ts: bucket, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v })
    }
  }
  return out
}

type CacheEntry = { at: number; candles: Candle[] }
const cache = new Map<string, CacheEntry>()

async function cached(key: string, ttlMs: number, load: () => Promise<Candle[]>): Promise<Candle[]> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.candles
  const candles = await load()
  cache.set(key, { at: Date.now(), candles })
  return candles
}

/** The four timeframes ST Quant reads. Slow timeframes are cached; 15m is always fresh. */
export async function loadFrames(asset: AssetRef): Promise<Frames> {
  const key = assetKey(asset)
  if (asset.source === 'binance') {
    const [m15, h1, h4, d1] = await Promise.all([
      binanceKlines(asset.market, '15m', { limit: 500 }),
      cached(`${key}:1h`, 10 * 60_000, () => binanceKlines(asset.market, '1h', { limit: 500 })),
      cached(`${key}:4h`, 30 * 60_000, () => binanceKlines(asset.market, '4h', { limit: 500 })),
      cached(`${key}:1d`, 2 * 3600_000, () => binanceKlines(asset.market, '1d', { limit: 500 })),
    ])
    return { m15, h1, h4, d1 }
  }
  const m15 = await poolOhlcv(asset.network, asset.pool, 'minute', 15)
  const h1 = await cached(`${key}:1h`, 30 * 60_000, () => poolOhlcv(asset.network, asset.pool, 'hour', 1))
  const d1 = await cached(`${key}:1d`, 4 * 3600_000, () => poolOhlcv(asset.network, asset.pool, 'day', 1))
  const h4 = aggregate(h1, TF_MS['4h'])
  return { m15, h1, h4, d1 }
}

/** 15-minute candles from `sinceSec` to now, for resolving a setup. */
export async function candles15mSince(asset: AssetRef, sinceSec: number): Promise<Candle[]> {
  if (asset.source === 'binance') {
    const out: Candle[] = []
    let start = sinceSec * 1000
    for (let i = 0; i < 10; i++) {
      const batch = await binanceKlines(asset.market, '15m', { startMs: start, limit: 1000 })
      out.push(...batch)
      if (batch.length < 1000) break
      start = batch.at(-1)!.ts + TF_MS['15m']
    }
    return out
  }
  // 1000 fifteen-minute candles cover 10 days, longer than any call stays open.
  const all = await poolOhlcv(asset.network, asset.pool, 'minute', 15)
  return all.filter(k => k.ts >= sinceSec * 1000)
}
