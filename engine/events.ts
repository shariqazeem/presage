import { lt } from 'drizzle-orm'
import { getDb, schema } from '../lib/db'
import type { EventKind, RadarRow } from '../lib/floor-types'

let lastPrune = 0

/** Record what an agent just did. The floor reads these; nothing here may leak a sealed call's levels. */
export function emit(agentId: number, kind: EventKind, data: Record<string, unknown>): void {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  db.insert(schema.agentEvents).values({ agentId, kind, at: now, data: JSON.stringify(data) }).run()
  if (now - lastPrune > 3600) {
    lastPrune = now
    db.delete(schema.agentEvents).where(lt(schema.agentEvents.at, now - 7 * 86_400)).run()
  }
}

/** The latest reading of every market an agent watches. One row per market, replaced each scan. */
export function setRadar(agentId: number, rows: RadarRow[]): void {
  const value = JSON.stringify(rows)
  getDb()
    .insert(schema.kv)
    .values({ key: `radar:${agentId}`, value })
    .onConflictDoUpdate({ target: schema.kv.key, set: { value } })
    .run()
}
