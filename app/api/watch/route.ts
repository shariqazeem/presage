import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** "Ping me" through Telegram: the signed-in wallet's linked chat waits on a call or an agent. */
export async function POST(req: NextRequest) {
  const wallet = await viewer()
  if (!wallet) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { target?: string; id?: number }
  if (b.target !== 'call' && b.target !== 'agent') return NextResponse.json({ error: 'target must be call or agent' }, { status: 400 })
  if (!Number.isInteger(b.id) || (b.id as number) <= 0) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const db = getDb()
  const exists = db
    .select({ id: schema.watches.id })
    .from(schema.watches)
    .where(and(eq(schema.watches.channel, 'telegram'), eq(schema.watches.address, wallet), eq(schema.watches.target, b.target), eq(schema.watches.targetId, b.id as number), isNull(schema.watches.doneAt)))
    .get()
  if (!exists) db.insert(schema.watches).values({ channel: 'telegram', address: wallet, target: b.target, targetId: b.id as number, createdAt: Math.floor(Date.now() / 1000) }).run()
  const linked = Boolean(db.select({ w: schema.telegramLinks.wallet }).from(schema.telegramLinks).where(eq(schema.telegramLinks.wallet, wallet)).get())
  return NextResponse.json({ ok: true, linked })
}
