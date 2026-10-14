import { NextResponse } from 'next/server'
import { recentCalls } from '@/lib/server/records'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ calls: recentCalls({ limit: 40, viewer: await viewer() }) })
}
