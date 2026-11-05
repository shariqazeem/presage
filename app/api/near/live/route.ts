import { NextResponse } from 'next/server'
import { livePrices } from '@/lib/near/live'

export const dynamic = 'force-dynamic'

/** Live prices of the coins ParallaxPay trades, from their Rhea pools on NEAR. */
export async function GET() {
  try {
    return NextResponse.json(await livePrices(), { headers: { 'cache-control': 'public, max-age=3' } })
  } catch {
    return NextResponse.json({ error: 'Rhea is not answering right now' }, { status: 503 })
  }
}
