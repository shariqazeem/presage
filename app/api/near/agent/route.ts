import { NextResponse } from 'next/server'
import { agentSnapshot } from '@/lib/near/snapshot'

export const dynamic = 'force-dynamic'

/** What the agent sees right now, what it said lately, and its record. Public. */
export async function GET() {
  return NextResponse.json(await agentSnapshot(), { headers: { 'cache-control': 'public, max-age=5' } })
}
