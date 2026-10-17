import { NextResponse, type NextRequest } from 'next/server'
import { getAgent, recentCalls } from '@/lib/server/records'
import { viewer } from '@/lib/server/session'
import { describeSpec } from '@/lib/spec/describe'
import { StrategySpec } from '@/lib/spec/schema'
import { getDb, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { FEED_KINDS, agentStatus, radarFor, recentEvents } from '@/lib/server/floor'
import { HOUSE_PERSONAS, type Persona } from '@/lib/personas'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const agent = getAgent(slug)
  if (!agent) return NextResponse.json({ error: 'No such agent' }, { status: 404 })
  const wallet = await viewer()
  const row = getDb().select({ specJson: schema.agents.specJson }).from(schema.agents).where(eq(schema.agents.id, agent.id)).get()
  let rules: ReturnType<typeof describeSpec> | null = null
  if (!agent.house && row) {
    const parsed = StrategySpec.safeParse(JSON.parse(row.specJson))
    if (parsed.success) rules = describeSpec(parsed.data)
  }
  const persona: Persona = HOUSE_PERSONAS[agent.slug] ?? {
    tagline: rules ? rules.rules[0].replace(/^Looks for a long setup when all of these are true: /, 'Buys when ').slice(0, 140) : agent.description,
    thesis: agent.description,
    method: rules?.rules ?? [],
    honest: 'A creator strategy. Unproven until its record says otherwise; it may lose.',
  }
  return NextResponse.json({
    agent,
    persona,
    status: agentStatus(agent.id, agent.kind, wallet),
    radar: agent.kind === 'setup' ? radarFor(agent.id, wallet) : [],
    events: recentEvents({ agentId: agent.id, limit: 30, viewer: wallet, kinds: FEED_KINDS }),
    rules,
    spec: row?.specJson ?? null,
    calls: recentCalls({ agentId: agent.id, limit: 100, viewer: wallet }),
    viewer: wallet,
  })
}
