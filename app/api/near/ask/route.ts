import { NextResponse, type NextRequest } from 'next/server'
import { ask } from '@/lib/near/ask'

export const dynamic = 'force-dynamic'

// Each answer costs a model call, so they're rationed: a few per visitor an hour, and a daily total.
const PER_VISITOR_PER_HOUR = 10
const perVisitor = new Map<string, number[]>()
let day = ''
let usedToday = 0

function take(visitor: string): string | null {
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  if (today !== day) {
    day = today
    usedToday = 0
    perVisitor.clear()
  }
  if (usedToday >= Number(process.env.ASK_MAX_PER_DAY ?? 300)) return 'I’ve answered a lot today. Ask me again tomorrow, and watch the floor meanwhile.'
  const recent = (perVisitor.get(visitor) ?? []).filter(t => now - t < 3_600_000)
  if (recent.length >= PER_VISITOR_PER_HOUR) return 'That’s plenty of questions for this hour. Try again a bit later.'
  recent.push(now)
  perVisitor.set(visitor, recent)
  usedToday++
  return null
}

/** Ask ParallaxPay about what it sees. `account` (optional) lets it answer about the asker's own account. */
export async function POST(req: NextRequest) {
  const { question, account } = (await req.json().catch(() => ({}))) as { question?: string; account?: string }
  const q = (question ?? '').trim()
  if (q.length < 3 || q.length > 400) return NextResponse.json({ error: 'Ask in a sentence or two' }, { status: 400 })
  const visitor = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const refused = take(visitor)
  if (refused) return NextResponse.json({ error: refused }, { status: 429 })
  try {
    const a = await ask(q, account && /^[a-z0-9._-]{2,64}$/.test(account) ? account : null)
    return NextResponse.json(a)
  } catch {
    return NextResponse.json({ error: 'I couldn’t think that through just now. Try again in a minute.' }, { status: 503 })
  }
}
