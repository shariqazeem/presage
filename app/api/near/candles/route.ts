import { NextResponse, type NextRequest } from 'next/server'
import { WARMUP, WINDOW, type DrawTf } from '@/lib/near/drawing'
import { getCandles } from '@/lib/near/snapshot'

export const dynamic = 'force-dynamic'

/**
 * Candles for the coins ParallaxPay trades, from the same source it reads: the window it analyses
 * (plus money flow's warm-up), or with `all=1` everything the server has, for zooming out.
 */
export async function GET(req: NextRequest) {
  const coin = req.nextUrl.searchParams.get('coin') ?? ''
  const tf = req.nextUrl.searchParams.get('tf') ?? '15m'
  const all = req.nextUrl.searchParams.get('all') === '1'
  const candles = await getCandles(coin, tf).catch(() => null)
  if (!candles) return NextResponse.json({ error: 'Unknown coin or no candles' }, { status: 400 })
  const keep = WINDOW[tf as DrawTf] + WARMUP
  return NextResponse.json({ coin, tf, candles: all ? candles : candles.slice(-keep) }, { headers: { 'cache-control': `public, max-age=${all ? 60 : 15}` } })
}
