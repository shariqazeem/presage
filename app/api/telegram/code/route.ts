import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** A one-time code that links the signed-in wallet to a Telegram chat via t.me/<bot>?start=<code>. */
export async function POST() {
  const wallet = await viewer()
  if (!wallet) return NextResponse.json({ error: 'Sign in with your wallet first' }, { status: 401 })
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT
  if (!bot) return NextResponse.json({ error: 'Telegram alerts are not set up yet' }, { status: 503 })
  const code = randomBytes(12).toString('base64url')
  getDb().insert(schema.telegramCodes).values({ code, wallet, createdAt: Math.floor(Date.now() / 1000) }).run()
  const linked = getDb().select().from(schema.telegramLinks).where(eq(schema.telegramLinks.wallet, wallet)).get()
  return NextResponse.json({ url: `https://t.me/${bot}?start=${code}`, linked: Boolean(linked) })
}

export async function GET() {
  const wallet = await viewer()
  if (!wallet) return NextResponse.json({ linked: false })
  const linked = getDb().select().from(schema.telegramLinks).where(eq(schema.telegramLinks.wallet, wallet)).get()
  return NextResponse.json({ linked: Boolean(linked), username: linked?.username ?? null })
}
