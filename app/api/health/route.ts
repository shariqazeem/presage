import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { chain, deployment } from '@/lib/chain'
import { getDb, schema } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Is the engine alive? It seals and reveals calls, so if it stops, everyone should be able to see it. */
export async function GET() {
  const db = getDb()
  const beat = db.select().from(schema.kv).where(eq(schema.kv.key, 'engine:heartbeat')).get()
  const indexed = db.select().from(schema.kv).where(eq(schema.kv.key, 'indexer:lastBlock')).get()
  const engine = beat ? (JSON.parse(beat.value) as { at: number; runner: string; balance: string }) : null
  const up = engine != null && Date.now() / 1000 - engine.at < 120
  return NextResponse.json(
    {
      web: 'ok',
      chainId: chain.id,
      deployed: Boolean(deployment),
      engine: engine ? { up, lastBeat: engine.at, runner: engine.runner, runnerBalance: engine.balance } : { up: false },
      indexedBlock: indexed ? Number(indexed.value) : null,
    },
    { status: up || !deployment ? 200 : 503 },
  )
}
