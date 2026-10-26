import { NextResponse, type NextRequest } from 'next/server'
import { compileStrategy } from '@/lib/spec/compile'
import { describeSpec } from '@/lib/spec/describe'
import { canonicalSpec } from '@/lib/spec/schema'
import { keccak256, stringToBytes } from 'viem'

export const dynamic = 'force-dynamic'

// Turning words into rules costs a model call and the visitor pays nothing for it, so it is rationed:
// a few per visitor an hour, and a daily total for everyone (COMPILE_MAX_PER_DAY). The styles on the
// Build page need no model at all, so nobody is ever stuck.
const PER_VISITOR_PER_HOUR = 6
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
  if (usedToday >= Number(process.env.COMPILE_MAX_PER_DAY ?? 100)) return 'Writing rules from your own words is resting for today. Start from one of the styles, or try again tomorrow.'
  const recent = (perVisitor.get(visitor) ?? []).filter(t => now - t < 3_600_000)
  if (recent.length >= PER_VISITOR_PER_HOUR) return 'You’ve turned a few strategies into rules this hour. Try again a bit later, or start from one of the styles.'
  recent.push(now)
  perVisitor.set(visitor, recent)
  usedToday++
  return null
}

export async function POST(req: NextRequest) {
  const { prompt, markets } = (await req.json()) as { prompt: string; markets: string[] }
  if (!prompt || prompt.trim().length < 15) return NextResponse.json({ error: 'Describe the strategy in a sentence or two' }, { status: 400 })
  const visitor = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const refused = take(visitor)
  if (refused) return NextResponse.json({ error: refused }, { status: 429 })
  const out = await compileStrategy(prompt.trim(), markets ?? [])
  if (!out.ok) return NextResponse.json(out, { status: 422 })
  const json = canonicalSpec(out.spec)
  return NextResponse.json({ ok: true, spec: out.spec, assumptions: out.assumptions, described: describeSpec(out.spec), specHash: keccak256(stringToBytes(json)) })
}
