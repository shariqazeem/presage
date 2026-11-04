import { NextResponse, type NextRequest } from 'next/server'
import { getCandles } from '@/lib/near/snapshot'

export const dynamic = 'force-dynamic'

/** Candles for the coins ParallaxPay trades, from the same source it reads. */
export async function GET(req: NextRequest) {
  const coin = req.nextUrl.searchParams.get('coin') ?? ''
  const tf = req.nextUrl.searchParams.get('tf') ?? '15m'
  const candles = await getCandles(coin, tf).catch(() => null)
  if (!candles) return NextResponse.json({ error: 'Unknown coin or no candles' }, { status: 400 })
  return NextResponse.json({ coin, tf, candles }, { headers: { 'cache-control': 'public, max-age=15' } })
}
