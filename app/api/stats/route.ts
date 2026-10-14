import { NextResponse } from 'next/server'
import { platformStats } from '@/lib/server/records'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(platformStats())
}
