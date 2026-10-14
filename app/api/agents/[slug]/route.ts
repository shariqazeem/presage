import { NextResponse, type NextRequest } from 'next/server'
import { getAgent, recentCalls } from '@/lib/server/records'
import { viewer } from '@/lib/server/session'
import { describeSpec } from '@/lib/spec/describe'
import { StrategySpec } from '@/lib/spec/schema'
import { getDb, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

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
  return NextResponse.json({
    agent,
    rules,
    spec: row?.specJson ?? null,
    calls: recentCalls({ agentId: agent.id, limit: 100, viewer: wallet }),
    viewer: wallet,
  })
}
