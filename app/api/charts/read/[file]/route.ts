import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/** The chart an agent looked at during a chart read. Only events that are not masked link here. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  if (!/^read-[0-9a-f]{12}\.png$/.test(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const path = resolve(process.env.PRESAGE_CHART_DIR ?? 'var/charts', file)
  if (!existsSync(path)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(readFileSync(path), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400, immutable' } })
}
