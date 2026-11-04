import { NextResponse, type NextRequest } from 'next/server'
import { ONE_CLICK, oneClickHeaders } from '@/lib/near/intents'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('depositAddress') ?? ''
  if (!/^[A-Za-z0-9]{20,128}$/.test(address)) return NextResponse.json({ error: 'Bad deposit address' }, { status: 400 })
  const memo = req.nextUrl.searchParams.get('depositMemo')
  const q = new URLSearchParams({ depositAddress: address, ...(memo ? { depositMemo: memo } : {}) })
  const res = await fetch(`${ONE_CLICK}/v0/status?${q}`, { headers: oneClickHeaders(), signal: AbortSignal.timeout(15_000), cache: 'no-store' })
  return NextResponse.json(await res.json().catch(() => ({ status: 'PENDING_DEPOSIT' })), { status: res.ok ? 200 : 502 })
}
