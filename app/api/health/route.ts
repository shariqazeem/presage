import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { VAULT_ID } from '@/lib/near/config'

export const dynamic = 'force-dynamic'

/** Is the agent alive? It writes a heartbeat every minute; if it stops, anyone can see it here. */
export async function GET() {
  const beat = getDb().select().from(schema.kv).where(eq(schema.kv.key, 'near:heartbeat')).get()
  const agent = beat ? (JSON.parse(beat.value) as { at: number; trading: boolean; analyst: string }) : null
  const up = agent != null && Date.now() / 1000 - agent.at < 150
  return NextResponse.json({ web: 'ok', vault: VAULT_ID, agent: agent ? { up, ...agent } : { up: false } }, { status: up ? 200 : 503 })
}
