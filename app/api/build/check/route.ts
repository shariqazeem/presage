import { NextResponse, type NextRequest } from 'next/server'
import { StrategySpec } from '@/lib/spec/schema'
import { describeSpec } from '@/lib/spec/describe'
import { loadFrames } from '@/lib/market/frames'
import { ORACLE_ASSETS } from '@/lib/oracle-assets'
import { evaluate } from '@/engine/spec-eval'

export const dynamic = 'force-dynamic'

/** Run a spec against every one of its markets right now, without sealing anything. */
export async function POST(req: NextRequest) {
  const parsed = StrategySpec.safeParse(((await req.json()) as { spec: unknown }).spec)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(i => i.message).join('; ') }, { status: 400 })
  const spec = parsed.data
  const results = await Promise.all(
    spec.markets.map(async market => {
      const symbol = ORACLE_ASSETS.find(a => a.market === market)?.symbol ?? market
      try {
        const frames = await loadFrames({ symbol, source: 'binance', market })
        const r = evaluate(spec, frames)
        return { symbol, market, fires: Boolean(r.signal), checks: r.checks, blocked: r.blocked ?? null, signal: r.signal }
      } catch (e) {
        return { symbol, market, fires: false, checks: [], blocked: e instanceof Error ? e.message : 'no data', signal: null }
      }
    }),
  )
  return NextResponse.json({ described: describeSpec(spec), results })
}
