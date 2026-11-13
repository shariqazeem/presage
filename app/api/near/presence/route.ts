import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// Who has the floor open right now: an anonymous id per browser tab (kept across reloads), forgotten 40 s
// after the tab stops asking. Tabs ask every 25 s while they're in front.
const seen = new Map<string, number>()

export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  const now = Date.now()
  if (id && /^[a-z0-9]{8,32}$/.test(id)) seen.set(id, now)
  for (const [k, at] of seen) if (now - at > 40_000) seen.delete(k)
  return NextResponse.json({ here: Math.max(1, seen.size) })
}
