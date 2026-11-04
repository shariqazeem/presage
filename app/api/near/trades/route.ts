import { NextResponse } from 'next/server'
import { allPositions, recordStats } from '@/lib/near/store'

export const dynamic = 'force-dynamic'

/** Every trade idea the agent acted on, open or done. A plan stays hidden until it's opened on NEAR. */
export async function GET() {
  return NextResponse.json({ trades: allPositions(150), stats: recordStats() })
}
