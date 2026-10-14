import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { getCall } from '@/lib/server/records'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** The chart a setup was published with. It shows the coin, so it stays private until the call is revealed. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const call = getCall(Number(id), await viewer())
  if (!call || call.hidden) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const path = resolve(process.env.PRESAGE_CHART_DIR ?? 'var/charts', `call-${call.id}.png`)
  if (!existsSync(path)) return NextResponse.json({ error: 'No chart for this call' }, { status: 404 })
  return new NextResponse(readFileSync(path), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } })
}
