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

/** Candles for a coin from the same source the agent reads: Binance, or the coin's own Rhea pool. */
export async function getCandles(symbol: string, tf: string): Promise<Candle[] | null> {
  const coin = coinBySymbol(symbol)
  const t = TF[tf]
  if (!coin || !t) return null
  const key = `${coin.symbol}:${t.interval}`
  const hit = candleCache.get(key)
  if (hit && Date.now() - hit.at < t.ttl) return hit.candles
  const candles =
    coin.feed.source === 'binance'
      ? await binanceKlines(coin.feed.market, t.interval, { limit: 300 })
      : (await poolOhlcv(coin.feed.network, coin.feed.pool, t.gt[0], t.gt[1], { limit: 300 })).slice(-300)
  candleCache.set(key, { at: Date.now(), candles })
  return candles
}

/** The same, but never slower than `ms`: a page would rather draw the chart a moment later than wait. */
export async function candlesWithin(symbol: string, tf: string, ms: number): Promise<Candle[] | null> {
  return Promise.race([getCandles(symbol, tf).catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))])
}
