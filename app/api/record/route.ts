import { NextResponse } from 'next/server'
import { recentCalls } from '@/lib/server/records'

export const dynamic = 'force-dynamic'

/** Every call, newest first, as the public sees it: sealed calls show only their fingerprint. */
export async function GET() {
  const calls = recentCalls({ limit: 5_000 })
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: calls.length, calls },
    { headers: { 'content-disposition': 'inline; filename="called-record.json"' } },
  )
}
