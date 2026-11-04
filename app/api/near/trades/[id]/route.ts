import { NextResponse, type NextRequest } from 'next/server'
import { positionRow, toView } from '@/lib/near/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = positionRow(Number((await params).id))
  if (!row || row.status === 'proposed') return NextResponse.json({ error: 'No such trade' }, { status: 404 })
  return NextResponse.json({ trade: toView(row) })
}
