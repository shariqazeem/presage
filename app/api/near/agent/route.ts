import { NextResponse } from 'next/server'
import { feedFor, latestReads, recordStats } from '@/lib/near/store'
import { vault } from '@/lib/near/vault'

export const dynamic = 'force-dynamic'

/** What the agent sees right now, what it said lately, and its record. Public. */
export async function GET() {
  const config = await vault.config().catch(() => null)
  const period = 15 * 60
  return NextResponse.json({
    // The agent re-reads the market 20 seconds after every 15-minute candle closes.
    nextCheckAt: Math.ceil((Date.now() / 1000 - 20) / period) * period + 20,
    reads: latestReads(),
    feed: feedFor(null, 30),
    record: recordStats(),
    vault: config ? { members: config.members, trades: config.trades, calls: config.calls, paused: config.paused } : null,
  })
}
