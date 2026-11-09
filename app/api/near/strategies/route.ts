import { NextResponse } from 'next/server'
import { HOUSE_ID, describe } from '@/lib/near/strategy'
import { publicStrategies, strategyRecords, type StrategyRecord } from '@/lib/near/strategyStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Fewer real trades than this is "new", not ranked. */
const MIN_RANKED = 3
const EMPTY: StrategyRecord = { trades: 0, wins: 0, avgPct: null, pnlUsd: 0, open: 0, members: 0, lastAt: null }

/**
 * The board: every strategy on show, ranked by its real, sealed trades. Records are public; settings
 * aren't, except the house strategy's, which is ParallaxPay's own published method.
 */
export async function GET() {
  const records = strategyRecords()
  const rows = publicStrategies().map(s => {
    const record = records.get(s.id) ?? EMPTY
    return { id: s.id, name: s.name, owner: s.owner, house: s.id === HOUSE_ID, adopted: s.adopted, createdAt: s.createdAt, record, ranked: record.trades >= MIN_RANKED, traits: s.id === HOUSE_ID ? describe(s.blocks) : null }
  })
  rows.sort((a, b) => Number(b.ranked) - Number(a.ranked) || (b.record.avgPct ?? -1) - (a.record.avgPct ?? -1) || b.record.trades - a.record.trades || Number(b.house) - Number(a.house) || b.createdAt - a.createdAt)
  return NextResponse.json({ strategies: rows, minRanked: MIN_RANKED })
}
