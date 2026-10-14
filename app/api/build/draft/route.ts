import { NextResponse, type NextRequest } from 'next/server'
import { keccak256, stringToBytes } from 'viem'
import { getDb, schema } from '@/lib/db'
import { viewer } from '@/lib/server/session'
import { StrategySpec, canonicalSpec } from '@/lib/spec/schema'

export const dynamic = 'force-dynamic'

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'agent'

/**
 * Save the spec the creator confirmed. Returns what the two transactions need: the ERC-8004 card URL
 * for the identity, and the spec hash and URL to seal in PresageAgents.
 */
export async function POST(req: NextRequest) {
  const wallet = await viewer()
  if (!wallet) return NextResponse.json({ error: 'Sign in with your wallet first' }, { status: 401 })
  const body = (await req.json()) as { name: string; description: string; prompt: string; spec: unknown; priceUsd6: number }
  const parsed = StrategySpec.safeParse(body.spec)
  if (!parsed.success) return NextResponse.json({ error: 'The spec is not valid' }, { status: 400 })
  const name = (body.name ?? '').trim().slice(0, 48)
  if (name.length < 3) return NextResponse.json({ error: 'Give the agent a name' }, { status: 400 })
  const price = Math.round(Number(body.priceUsd6))
  if (!(price >= 2_000_000 && price <= 500_000_000)) return NextResponse.json({ error: 'Price must be between $2 and $500 per 30 days' }, { status: 400 })

  const specJson = canonicalSpec(parsed.data)
  const specHash = keccak256(stringToBytes(specJson))
  const id = crypto.randomUUID()
  const slug = `${slugify(name)}-${id.slice(0, 4)}`
  getDb()
    .insert(schema.agentDrafts)
    .values({
      id,
      slug,
      creator: wallet,
      name,
      description: (body.description ?? '').trim().slice(0, 400) || `${name}: a creator strategy on Presage.`,
      prompt: (body.prompt ?? '').slice(0, 2000),
      specJson,
      specHash,
      priceUsd6: price,
      status: 'compiled',
      createdAt: Math.floor(Date.now() / 1000),
    })
    .run()
  return NextResponse.json({ draftId: id, slug, specHash, agentURI: `${site()}/api/agents/${slug}/card`, specURI: `${site()}/api/specs/${specHash}` })
}
