import { NextResponse } from 'next/server'
import { ONE_CLICK, ORIGINS } from '@/lib/near/intents'

export const dynamic = 'force-dynamic'

let cache: { at: number; prices: Record<string, number> } | null = null

/** The coins ParallaxPay can bring to NEAR, with 1-Click's current USD prices. */
export async function GET() {
  if (!cache || Date.now() - cache.at > 5 * 60_000) {
    try {
      const all = (await (await fetch(`${ONE_CLICK}/v0/tokens`, { signal: AbortSignal.timeout(10_000) })).json()) as { assetId: string; price?: number }[]
      cache = { at: Date.now(), prices: Object.fromEntries(all.filter(t => t.price != null).map(t => [t.assetId, t.price!])) }
    } catch {
      cache = cache ?? { at: 0, prices: {} }
    }
  }
  return NextResponse.json({ origins: ORIGINS.map(o => ({ ...o, price: cache!.prices[o.assetId] ?? null })) })
}
