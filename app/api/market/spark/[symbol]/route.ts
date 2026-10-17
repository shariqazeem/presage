import { NextResponse, type NextRequest } from 'next/server'
import { oracleMarket } from '@/lib/oracle'
import { binanceKlines } from '@/lib/market/binance'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { at: number; closes: number[] }>()

/** The last day of hourly closes for one coin, for a sparkline. Cached for a minute. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params
  const market = oracleMarket(symbol.toUpperCase())
  if (!market) return NextResponse.json({ error: 'Unknown coin' }, { status: 404 })
  const hit = cache.get(market)
  if (!hit || Date.now() - hit.at > 60_000) {
    try {
      const ks = await binanceKlines(market, '1h', { limit: 25 })
      cache.set(market, { at: Date.now(), closes: ks.map(k => k.c) })
    } catch (e) {
      if (!hit) return NextResponse.json({ error: e instanceof Error ? e.message : 'Binance did not answer' }, { status: 502 })
    }
  }
  return NextResponse.json({ symbol: symbol.toUpperCase(), closes: cache.get(market)!.closes }, { headers: { 'cache-control': 'public, max-age=30' } })
}
