import { NextResponse, type NextRequest } from 'next/server'
import { feedFor, positionsFor } from '@/lib/near/store'
import { vault } from '@/lib/near/vault'

export const dynamic = 'force-dynamic'

const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/

/** One member's desk: their vault account read live from NEAR, their positions, and their feed. */
export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account') ?? ''
  if (!ACCOUNT.test(account) || account.length < 2 || account.length > 64) return NextResponse.json({ error: 'Not a NEAR account' }, { status: 400 })
  const member = await vault.member(account).catch(() => undefined)
  return NextResponse.json({
    account,
    member: member ?? null,
    reachable: member !== undefined,
    positions: positionsFor(account),
    feed: feedFor(account, 40),
  })
}
