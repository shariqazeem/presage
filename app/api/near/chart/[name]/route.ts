import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * The chart ParallaxPay read: four timeframes with its support and resistance drawn and MFI under each.
 * `NEAR` / `ZEC` is the latest read; `pos-12` is the one it read when it sealed position 12's plan.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  if (!/^([A-Z]{2,6}|pos-\d{1,9})$/.test(name)) return NextResponse.json({ error: 'No such chart' }, { status: 404 })
  const path = resolve(process.env.PARALLAXPAY_CHART_DIR ?? 'var/charts', `near-${name}.png`)
  if (!existsSync(path)) return NextResponse.json({ error: 'No chart yet' }, { status: 404 })
  const live = !name.startsWith('pos-')
  return new NextResponse(readFileSync(path), {
    headers: {
      'content-type': 'image/png',
      'cache-control': live ? 'public, max-age=60' : 'public, max-age=86400, immutable',
      'last-modified': statSync(path).mtime.toUTCString(),
    },
  })
}
