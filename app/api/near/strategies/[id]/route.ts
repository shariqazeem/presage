import { NextResponse, type NextRequest } from 'next/server'
import { HOUSE_ID, describe } from '@/lib/near/strategy'
import { getStrategy, strategyRecords, strategyTrades } from '@/lib/near/strategyStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** One strategy on the board: its record and its real trades. Its settings unlock when you hire it. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const s = getStrategy(id)
  if (!s || !s.public) return NextResponse.json({ error: 'No such strategy on the board' }, { status: 404 })
  const record = strategyRecords().get(s.id) ?? { trades: 0, wins: 0, avgPct: null, pnlUsd: 0, open: 0, members: 0, lastAt: null }
  return NextResponse.json({
    strategy: { id: s.id, name: s.name, owner: s.owner, house: s.id === HOUSE_ID, adopted: s.adopted, createdAt: s.createdAt, hash: s.hash, traits: s.id === HOUSE_ID ? describe(s.blocks) : null },
    record,
    trades: strategyTrades(s.id, 30),
  })
}
