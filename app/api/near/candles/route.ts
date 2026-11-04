import { NextResponse, type NextRequest } from 'next/server'
import { binanceKlines, type BinanceInterval } from '@/lib/market/binance'
import { poolOhlcv } from '@/lib/market/geckoterminal'
import { coinBySymbol } from '@/lib/near/config'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { at: number; body: unknown }>()
const TF: Record<string, { interval: BinanceInterval; gt: ['minute' | 'hour' | 'day', number]; ttl: number }> = {
  '15m': { interval: '15m', gt: ['minute', 15], ttl: 20_000 },
  '1h': { interval: '1h', gt: ['hour', 1], ttl: 60_000 },
  '4h': { interval: '4h', gt: ['hour', 4], ttl: 120_000 },
  '1d': { interval: '1d', gt: ['day', 1], ttl: 600_000 },
}

/** Candles for the coins ParallaxPay trades, from the same source it reads: Binance, or the coin's Rhea pool. */
export async function GET(req: NextRequest) {
  const coin = coinBySymbol(req.nextUrl.searchParams.get('coin') ?? '')
  const tf = TF[req.nextUrl.searchParams.get('tf') ?? '15m']
  if (!coin || !tf) return NextResponse.json({ error: 'Unknown coin' }, { status: 400 })
  const key = `${coin.symbol}:${tf.interval}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < tf.ttl) return NextResponse.json(hit.body)
  const candles =
    coin.feed.source === 'binance'
      ? await binanceKlines(coin.feed.market, tf.interval, { limit: 300 })
      : (await poolOhlcv(coin.feed.network, coin.feed.pool, tf.gt[0], tf.gt[1], { limit: 300 })).slice(-300)
  const body = { coin: coin.symbol, tf: tf.interval, candles }
  cache.set(key, { at: Date.now(), body })
  return NextResponse.json(body)
}
