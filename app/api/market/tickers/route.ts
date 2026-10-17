import { NextResponse } from 'next/server'
import { ORACLE_ASSETS } from '@/lib/oracle-assets'
import { binanceTickers } from '@/lib/market/binance'

export const dynamic = 'force-dynamic'

type Row = { symbol: string; name: string; price: number; changePct: number; quoteVolume: number }
let cache: { at: number; rows: Row[] } | null = null

/** Price and 24h change for every coin the Oracle covers, from Binance. Cached for 30 seconds. */
export async function GET() {
  if (!cache || Date.now() - cache.at > 30_000) {
    try {
      const tickers = await binanceTickers(ORACLE_ASSETS.map(a => a.market))
      const rows = ORACLE_ASSETS.flatMap(a => {
        const t = tickers.find(x => x.market === a.market)
        return t ? [{ symbol: a.symbol, name: a.name, price: t.price, changePct: t.changePct, quoteVolume: t.quoteVolume }] : []
      })
      cache = { at: Date.now(), rows }
    } catch (e) {
      if (!cache) return NextResponse.json({ error: e instanceof Error ? e.message : 'Binance did not answer' }, { status: 502 })
    }
  }
  return NextResponse.json({ at: Math.floor(cache!.at / 1000), coins: cache!.rows }, { headers: { 'cache-control': 'public, max-age=20' } })
}
