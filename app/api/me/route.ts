import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { isAddress } from 'viem'
import { getDb, schema } from '@/lib/db'
import { agentsByCreator } from '@/lib/server/records'
import { agentStatus } from '@/lib/server/floor'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/**
 * What a wallet has on Presage: the agents it built, the agents it backs, and whether pings reach it.
 * All of it is public on chain already; nothing here needs a signature. GET /api/me?address=0x…
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.toLowerCase() ?? (await viewer())
  if (!address || !isAddress(address)) return NextResponse.json({ error: 'address is required' }, { status: 400 })
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const agents = agentsByCreator(address).map(a => ({ ...a, status: agentStatus(a.id, a.kind, address) }))
  const backing = db
    .select({ agentId: schema.subscriptions.agentId, until: schema.subscriptions.until })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.subscriber, address), gt(schema.subscriptions.until, now)))
    .all()
  const named = backing.map(b => {
    const a = db.select({ slug: schema.agents.slug, name: schema.agents.name, house: schema.agents.house }).from(schema.agents).where(eq(schema.agents.id, b.agentId)).get()
    return { ...b, slug: a?.slug ?? String(b.agentId), name: a?.name ?? `Agent ${b.agentId}`, house: a?.house ?? false }
  })
  const telegram = Boolean(db.select({ w: schema.telegramLinks.wallet }).from(schema.telegramLinks).where(eq(schema.telegramLinks.wallet, address)).get())
  return NextResponse.json({ address, agents, backing: named, telegram, signedIn: (await viewer()) === address })
}
