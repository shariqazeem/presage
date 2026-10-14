import { NextResponse, type NextRequest } from 'next/server'
import { getCall } from '@/lib/server/records'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const call = getCall(Number(id), await viewer())
  if (!call) return NextResponse.json({ error: 'No such call' }, { status: 404 })
  return NextResponse.json({ call })
}
