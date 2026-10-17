import type { Candle } from './types'

// Binance's public market-data mirror. No key, and it answers from places where api.binance.com is
// geo-blocked. Every Oracle call names its Binance market so anyone can fetch the same candles.
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com']

export type BinanceInterval = '1m' | '15m' | '1h' | '4h' | '1d'

async function getJson(path: string): Promise<unknown> {
  let lastErr: unknown
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
      if (res.ok) return await res.json()
      lastErr = new Error(`Binance ${res.status} for ${path}`)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

/** Candles oldest first. Pass `startMs`/`endMs` to fetch a specific window. */
export async function binanceKlines(
  market: string,
  interval: BinanceInterval,
  opts: { limit?: number; startMs?: number; endMs?: number } = {},
): Promise<Candle[]> {
  const q = new URLSearchParams({ symbol: market, interval, limit: String(opts.limit ?? 500) })
  if (opts.startMs != null) q.set('startTime', String(opts.startMs))
  if (opts.endMs != null) q.set('endTime', String(opts.endMs))
  const rows = (await getJson(`/api/v3/klines?${q}`)) as unknown[][]
  return rows.map(r => ({
    ts: Number(r[0]),
    o: Number(r[1]),
    h: Number(r[2]),
    l: Number(r[3]),
    c: Number(r[4]),
    v: Number(r[5]),
  }))
}

/** The close of the 1-minute candle that contains `atSec`, once that minute has finished. */
export async function binanceCloseAt(market: string, atSec: number): Promise<{ price: number; minute: number } | null> {
  const minuteMs = Math.floor(atSec / 60) * 60_000
  if (minuteMs + 60_000 > Date.now()) return null
  const [k] = await binanceKlines(market, '1m', { startMs: minuteMs, endMs: minuteMs + 59_999, limit: 1 })
  return k && k.ts === minuteMs ? { price: k.c, minute: minuteMs / 1000 } : null
}

/** Last price from the most recent closed 1-minute candle, with that minute's start time. */
export async function binanceLastClose(market: string): Promise<{ price: number; minute: number }> {
  const ks = await binanceKlines(market, '1m', { limit: 2 })
  const now = Date.now()
  const closed = ks.filter(k => k.ts + 60_000 <= now)
  const k = closed.at(-1) ?? ks[0]
  return { price: k.c, minute: k.ts / 1000 }
}

export async function binance24h(market: string): Promise<{ changePct: number; quoteVolume: number; high: number; low: number }> {
  const t = (await getJson(`/api/v3/ticker/24hr?symbol=${market}`)) as Record<string, string>
  return {
    changePct: Number(t.priceChangePercent),
    quoteVolume: Number(t.quoteVolume),
    high: Number(t.highPrice),
    low: Number(t.lowPrice),
  }
}

/** Every USDT spot market Binance is currently trading. */
export async function binanceUsdtMarkets(): Promise<Set<string>> {
  const info = (await getJson('/api/v3/exchangeInfo?permissions=SPOT')) as {
    symbols: { symbol: string; status: string; quoteAsset: string }[]
  }
  return new Set(info.symbols.filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT').map(s => s.symbol))
}

export type Ticker = { market: string; price: number; changePct: number; quoteVolume: number }

/** 24-hour tickers for many markets in one request. */
export async function binanceTickers(markets: string[]): Promise<Ticker[]> {
  if (!markets.length) return []
  const rows = (await getJson(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(markets))}`)) as Record<string, string>[]
  return rows.map(t => ({ market: t.symbol, price: Number(t.lastPrice), changePct: Number(t.priceChangePercent), quoteVolume: Number(t.quoteVolume) }))
}
