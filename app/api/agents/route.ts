import { NextResponse } from 'next/server'
import { listAgents } from '@/lib/server/records'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ agents: listAgents() })
}
