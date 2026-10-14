import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { HttpError, oracleAnswer } from '@/lib/server/x402'

export const dynamic = 'force-dynamic'

/** Poll a paid request: GET /api/oracle/call/<requestId>?secret=<secret> */
export async function GET(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params
    const secret = req.nextUrl.searchParams.get('secret')
    if (!secret) throw new HttpError(400, 'secret is required')
    return NextResponse.json(oracleAnswer(requestId as Hex, secret))
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status })
  }
}
