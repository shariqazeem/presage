import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Body = { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; target?: string; id?: number; wallet?: string }

/**
 * "Ping me when …" through the browser: store the browser's push subscription and what it is waiting
 * for. A call is pinged once, when it opens; an agent every time it seals or closes a call.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Body
  const sub = b.subscription
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return NextResponse.json({ error: 'A push subscription is required' }, { status: 400 })
  if (b.target !== 'call' && b.target !== 'agent') return NextResponse.json({ error: 'target must be call or agent' }, { status: 400 })
  if (!Number.isInteger(b.id) || (b.id as number) <= 0) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const wallet = typeof b.wallet === 'string' && /^0x[0-9a-fA-F]{40}$/.test(b.wallet) ? b.wallet.toLowerCase() : null
  db.insert(schema.pushSubs)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, wallet, createdAt: now })
    .onConflictDoUpdate({ target: schema.pushSubs.endpoint, set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, failedAt: null, ...(wallet ? { wallet } : {}) } })
    .run()
  const exists = db
    .select({ id: schema.watches.id })
    .from(schema.watches)
    .where(and(eq(schema.watches.channel, 'push'), eq(schema.watches.address, sub.endpoint), eq(schema.watches.target, b.target), eq(schema.watches.targetId, b.id as number), isNull(schema.watches.doneAt)))
    .get()
  if (!exists) db.insert(schema.watches).values({ channel: 'push', address: sub.endpoint, target: b.target, targetId: b.id as number, createdAt: now }).run()
  return NextResponse.json({ ok: true })
}
