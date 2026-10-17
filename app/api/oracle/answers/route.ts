import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { oracleAnswer } from '@/lib/server/x402'

export const dynamic = 'force-dynamic'

/**
 * Many paid answers at once, for "your calls": POST {items:[{requestId, secret}]}. Each secret only
 * unlocks its own request, exactly as GET /api/oracle/call/<id>?secret= does.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { items?: { requestId?: string; secret?: string }[] }
  const items = (body.items ?? []).slice(0, 40)
  const answers = items.map(it => {
    try {
      if (!it.requestId || !it.secret) throw new Error('requestId and secret are required')
      return oracleAnswer(it.requestId as Hex, it.secret)
    } catch (e) {
      return { requestId: it.requestId ?? null, error: e instanceof Error ? e.message : 'Unknown request' }
    }
  })
  return NextResponse.json({ answers })
}
