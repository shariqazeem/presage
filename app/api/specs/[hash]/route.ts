import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** The exact spec bytes behind a hash sealed in CalledAgents. keccak256 of this body equals the hash. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params
  const db = getDb()
  const row =
    db.select({ specJson: schema.agents.specJson }).from(schema.agents).where(eq(schema.agents.specHash, hash)).get() ??
    db.select({ specJson: schema.agentDrafts.specJson }).from(schema.agentDrafts).where(eq(schema.agentDrafts.specHash, hash)).get()
  if (!row) return NextResponse.json({ error: 'No spec with that hash' }, { status: 404 })
  return new NextResponse(row.specJson, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' } })
}
