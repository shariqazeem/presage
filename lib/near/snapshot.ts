import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { binanceKlines, type BinanceInterval } from '../market/binance'
import { poolOhlcv } from '../market/geckoterminal'
import type { Candle } from '../market/types'
import { coinBySymbol } from './config'
import type { AgentState } from './hooks'
import { feedFor, latestReads, recordStats } from './store'
import { vault, type VaultConfig } from './vault'

/**
 * What the app shows about the agent, built on the server so pages arrive already filled in.
 * The vault's config is an RPC call, so it is cached for a minute and never holds up a page.
 */

let config: { at: number; value: VaultConfig | null } | null = null
let refreshing: Promise<void> | null = null

function refreshConfig() {
  refreshing ??= vault
    .config()
    .then(v => void (config = { at: Date.now(), value: v }))
    .catch(() => void (config = { at: Date.now(), value: config?.value ?? null }))
    .finally(() => (refreshing = null))
  return refreshing
}

export async function agentSnapshot(): Promise<AgentState> {
  if (!config) await Promise.race([refreshConfig(), new Promise(r => setTimeout(r, 1200))])
  else if (Date.now() - config.at > 60_000) void refreshConfig()
  const c = config?.value ?? null
  const period = 15 * 60
  return {
    // The agent re-reads the market 20 seconds after every 15-minute candle closes.
    nextCheckAt: Math.ceil((Date.now() / 1000 - 20) / period) * period + 20,
    reads: latestReads() as AgentState['reads'],
    feed: feedFor(null, 30),
    record: recordStats(),
    vault: c ? { members: c.members, trades: c.trades, calls: c.calls, paused: c.paused } : null,
  }
}

const TF: Record<string, { interval: BinanceInterval; gt: ['minute' | 'hour' | 'day', number]; ttl: number }> = {
  '15m': { interval: '15m', gt: ['minute', 15], ttl: 20_000 },
  '1h': { interval: '1h', gt: ['hour', 1], ttl: 60_000 },
  '4h': { interval: '4h', gt: ['hour', 4], ttl: 120_000 },
  '1d': { interval: '1d', gt: ['day', 1], ttl: 600_000 },
}
const candleCache = new Map<string, { at: number; candles: Candle[] }>()
const inFlight = new Map<string, Promise<Candle[]>>()
const agentCache = new Map<string, { mtime: number; frames: Record<string, Candle[]> }>()

/**
 * The candles the agent itself read at its last check, saved beside its chart image by the agent
 * (engine/near/desk.ts). Drawing from these means the app shows exactly what the agent analysed and
 * makes no market requests of its own. Ignored once the agent hasn't read a coin for 40 minutes.
 */
function agentFrames(symbol: string): Record<string, Candle[]> | null {
  const path = resolve(process.env.PARALLAXPAY_CHART_DIR ?? 'var/charts', `near-${symbol}.json`)
  try {
    const st = statSync(path)
    if (Date.now() - st.mtimeMs > 40 * 60_000) return null
    const hit = agentCache.get(symbol)
    if (hit && hit.mtime === st.mtimeMs) return hit.frames
    const frames = (JSON.parse(readFileSync(path, 'utf8')) as { frames: Record<string, Candle[]> }).frames
    agentCache.set(symbol, { mtime: st.mtimeMs, frames })
    return frames
  } catch {
    return null
  }
}

function fetchCandles(key: string, coin: NonNullable<ReturnType<typeof coinBySymbol>>, t: (typeof TF)[string]): Promise<Candle[]> {
  let p = inFlight.get(key)
  if (!p) {
    p = (
      coin.feed.source === 'binance'
        ? binanceKlines(coin.feed.market, t.interval, { limit: 300 })
        : poolOhlcv(coin.feed.network, coin.feed.pool, t.gt[0], t.gt[1], { limit: 300 }).then(c => c.slice(-300))
    )
      .then(candles => {
        candleCache.set(key, { at: Date.now(), candles })
        return candles
      })
      .finally(() => inFlight.delete(key))
    inFlight.set(key, p)
  }
  return p
}

/**
 * Candles for a coin: what the agent read at its last check when it has them, otherwise from the same
 * source it reads (Binance, or the coin's own Rhea pool). A cached copy is served at once and refreshed
 * behind it, so a page only ever waits for candles nobody has asked for yet.
 */
export async function getCandles(symbol: string, tf: string): Promise<Candle[] | null> {
  const coin = coinBySymbol(symbol)
  const t = TF[tf]
  if (!coin || !t) return null
  const read = agentFrames(coin.symbol)?.[tf]
  if (read?.length) return read
  const key = `${coin.symbol}:${t.interval}`
  const hit = candleCache.get(key)
  if (hit) {
    if (Date.now() - hit.at >= t.ttl) fetchCandles(key, coin, t).catch(() => {})
    return hit.candles
  }
  return fetchCandles(key, coin, t)
}

/** The same, but never slower than `ms`: a page would rather draw the chart a moment later than wait. */
export async function candlesWithin(symbol: string, tf: string, ms: number): Promise<Candle[] | null> {
  return Promise.race([getCandles(symbol, tf).catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))])
}
