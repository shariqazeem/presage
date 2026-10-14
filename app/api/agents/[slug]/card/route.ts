import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { caip2, deployment, erc8004 } from '@/lib/chain'
import { getDb, schema } from '@/lib/db'

export const dynamic = 'force-dynamic'

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * The ERC-8004 registration file an agent's identity points to (registration-v1). It also says where
 * the agent's record lives on chain, so anyone holding the identity can find the calls behind it.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = getDb()
  const agent = db.select().from(schema.agents).where(eq(schema.agents.slug, slug)).get()
  const draft = agent ? null : db.select().from(schema.agentDrafts).where(eq(schema.agentDrafts.slug, slug)).get()
  if (!agent && !draft) return NextResponse.json({ error: 'No such agent' }, { status: 404 })

  const name = agent?.name ?? draft!.name
  const description = agent?.description ?? draft!.description
  const id = agent?.id ?? draft?.identityId ?? null
  const kind = agent?.kind ?? 'setup'
  const services: { name: string; endpoint: string; version?: string }[] = [{ name: 'web', endpoint: `${site()}/agents/${slug}` }]
  if (slug === 'oracle') services.push({ name: 'x402', endpoint: `${site()}/api/oracle/call` })

  return NextResponse.json(
    {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      image: `${site()}/presage-mark.svg`,
      services,
      x402Support: slug === 'oracle',
      active: agent ? !agent.retired : false,
      registrations: id != null ? [{ agentId: id, agentRegistry: `${caip2}:${erc8004.identity}` }] : [],
      supportedTrust: ['reputation'],
      presage: {
        kind,
        specHash: agent?.specHash ?? draft!.specHash,
        record: `${site()}/agents/${slug}`,
        calls: deployment ? `${caip2}:${deployment.calls}` : null,
        agents: deployment ? `${caip2}:${deployment.agents}` : null,
        rules: kind === 'direction' ? 'presage/direction-v1' : 'presage/setup-v1',
        scoring: 'Every call is sealed before its outcome and revealed after. A call not revealed in time can be forfeited by anyone and counts as a loss.',
      },
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  )
}
