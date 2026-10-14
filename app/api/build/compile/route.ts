import { NextResponse, type NextRequest } from 'next/server'
import { compileStrategy } from '@/lib/spec/compile'
import { describeSpec } from '@/lib/spec/describe'
import { canonicalSpec } from '@/lib/spec/schema'
import { keccak256, stringToBytes } from 'viem'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { prompt, markets } = (await req.json()) as { prompt: string; markets: string[] }
  if (!prompt || prompt.trim().length < 15) return NextResponse.json({ error: 'Describe the strategy in a sentence or two' }, { status: 400 })
  const out = await compileStrategy(prompt.trim(), markets ?? [])
  if (!out.ok) return NextResponse.json(out, { status: 422 })
  const json = canonicalSpec(out.spec)
  return NextResponse.json({ ok: true, spec: out.spec, assumptions: out.assumptions, described: describeSpec(out.spec), specHash: keccak256(stringToBytes(json)) })
}
