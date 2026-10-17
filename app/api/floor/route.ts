import { NextResponse, type NextRequest } from 'next/server'
import { listAgents, platformStats } from '@/lib/server/records'
import { FEED_KINDS, agentStatus, economy, radarFor, recentEvents } from '@/lib/server/floor'
import { viewer } from '@/lib/server/session'
import { HOUSE_PERSONAS } from '@/lib/personas'
import { getDb, schema } from '@/lib/db'
import { deployment } from '@/lib/chain'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/** Everything the floor shows: who is doing what, the latest events, ST Quant's radar, the economy. */
export async function GET(req: NextRequest) {
  const wallet = await viewer()
  const since = Number(req.nextUrl.searchParams.get('since') ?? 0) || undefined
  const agents = listAgents().map(a => ({ ...a, status: agentStatus(a.id, a.kind, wallet), tagline: HOUSE_PERSONAS[a.slug]?.tagline ?? null }))
  const stq = getDb().select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.slug, 'st-quant')).get()
  const beat = getDb().select().from(schema.kv).where(eq(schema.kv.key, 'engine:heartbeat')).get()
  const engineUp = beat ? Date.now() / 1000 - (JSON.parse(beat.value) as { at: number }).at < 120 : false
  return NextResponse.json({
    now: Math.floor(Date.now() / 1000),
    deployed: Boolean(deployment),
    engineUp,
    agents,
    events: recentEvents({ limit: 50, viewer: wallet, since, kinds: FEED_KINDS }),
    radar: stq ? radarFor(stq.id, wallet) : [],
    economy: economy(),
    stats: platformStats(),
    viewer: wallet,
  })
}
