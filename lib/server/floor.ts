import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { getDb, schema } from '../db'
import type { AgentEvent, AgentStatus, RadarRow } from '../floor-types'
import { isSubscriber } from './records'
import { metisUsd } from './metis-price'

type EventRow = typeof schema.agentEvents.$inferSelect

/**
 * A viewer may see a symbol in an event or radar row only if the agent has no sealed call on that
 * symbol right now, or the viewer backs the agent. The levels of a sealed call never appear here at all.
 */
function sealedSymbols(agentId: number): Set<string> {
  const rows = getDb()
    .select({ asset: schema.calls.asset })
    .from(schema.calls)
    .where(and(eq(schema.calls.agentId, agentId), eq(schema.calls.status, 'sealed')))
    .all()
  return new Set(rows.map(r => r.asset))
}

const cache = new Map<number, { at: number; sealed: Set<string> }>()
function sealedFor(agentId: number): Set<string> {
  const hit = cache.get(agentId)
  if (hit && Date.now() - hit.at < 5_000) return hit.sealed
  const sealed = sealedSymbols(agentId)
  cache.set(agentId, { at: Date.now(), sealed })
  return sealed
}

const HIDE_SYMBOL = new Set(['candidate', 'chart_read', 'sealed', 'skipped'])

function callStillSealed(callId: number): boolean {
  const row = getDb().select({ status: schema.calls.status }).from(schema.calls).where(eq(schema.calls.id, callId)).get()
  return row?.status === 'sealed' || row?.status === 'pending'
}

export function toEvent(
  r: EventRow,
  agent: { slug: string; name: string; creator: string } | undefined,
  viewer: string | null,
): AgentEvent {
  const data = JSON.parse(r.data) as Record<string, unknown>
  let masked = false
  const symbol = typeof data.symbol === 'string' ? data.symbol : null
  // An answer's direction is the asker's until the call opens; a paid question's coin is theirs too.
  if (r.kind === 'answered' && typeof data.callId === 'number' && callStillSealed(data.callId)) {
    delete data.direction
    delete data.confidence
    if (data.paid) delete data.symbol
    masked = true
  }
  if (symbol && HIDE_SYMBOL.has(r.kind)) {
    const canSee = viewer != null && (agent?.creator.toLowerCase() === viewer || isSubscriber(r.agentId, viewer))
    const stillSealed = sealedFor(r.agentId).has(symbol)
    // A chart read that led nowhere is public; one that became a sealed call hides the coin until reveal.
    const sensitive = r.kind === 'sealed' || r.kind === 'candidate' || (r.kind === 'chart_read' && data.verdict === 'BUY') || r.kind === 'skipped'
    if (sensitive && stillSealed && !canSee) {
      masked = true
      delete data.symbol
      delete data.chart
    } else if (r.kind === 'candidate' && !canSee && stillSealed) {
      masked = true
      delete data.symbol
    }
  }
  return {
    id: r.id,
    agentId: r.agentId,
    agentSlug: agent?.slug ?? String(r.agentId),
    agentName: agent?.name ?? `Agent ${r.agentId}`,
    kind: r.kind as AgentEvent['kind'],
    at: r.at,
    data,
    masked,
  }
}

/** The events worth reading in a feed. Scans and near-misses live on the radar instead. */
export const FEED_KINDS = ['sealed', 'resolved', 'answered', 'chart_read', 'skipped', 'forfeited']

export function recentEvents(opts: { agentId?: number; limit?: number; viewer?: string | null; since?: number; kinds?: string[] } = {}): AgentEvent[] {
  const db = getDb()
  const where = [
    opts.agentId != null ? eq(schema.agentEvents.agentId, opts.agentId) : undefined,
    opts.since ? gt(schema.agentEvents.at, opts.since) : undefined,
    opts.kinds ? inArray(schema.agentEvents.kind, opts.kinds) : undefined,
  ].filter(Boolean)
  const rows = db
    .select()
    .from(schema.agentEvents)
    .where(where.length ? and(...(where as [ReturnType<typeof eq>])) : undefined)
    .orderBy(desc(schema.agentEvents.id))
    .limit(opts.limit ?? 60)
    .all()
  const agents = db.select({ id: schema.agents.id, slug: schema.agents.slug, name: schema.agents.name, creator: schema.agents.creator }).from(schema.agents).all()
  return rows.map(r => toEvent(r, agents.find(a => a.id === r.agentId), opts.viewer ?? null))
}

/** When ST Quant and creator agents next look: they scan a minute after each 15-minute candle closes. */
export function nextScanAt(now = Math.floor(Date.now() / 1000)): number {
  const next = Math.ceil((now - 60) / 900) * 900 + 60
  return next <= now ? next + 900 : next
}

const VERDICT_WORDS: Record<string, string> = { BUY: 'looks right', WAIT: 'not yet', AVOID: 'no' }

/** What an agent is doing right now, in plain words, read from its latest events. */
export function agentStatus(agentId: number, kind: 'direction' | 'setup', viewer: string | null = null): AgentStatus {
  const now = Math.floor(Date.now() / 1000)
  const last = recentEvents({ agentId, limit: 6, viewer })
  const latest = last[0]
  if (!latest) return { state: 'idle', line: kind === 'direction' ? 'Waiting for a question' : 'Waiting for the next candle', at: now }
  const d = latest.data
  const sym = typeof d.symbol === 'string' ? d.symbol : null
  const age = now - latest.at
  switch (latest.kind) {
    case 'scan':
      if (d.phase === 'start' && age < 20 * 60) return { state: 'scanning', line: `Checking ${d.markets} markets`, at: latest.at }
      return { state: 'waiting', line: `Checked ${d.markets} markets${Number(d.candidates) ? ` · ${d.candidates} forming` : ''}`, at: latest.at }
    case 'candidate':
      return { state: 'reading', line: sym ? `Looking closely at ${sym}` : 'Looking closely at a market', at: latest.at }
    case 'chart_read':
      return { state: 'waiting', line: sym ? `Read the ${sym} chart: ${VERDICT_WORDS[String(d.verdict)] ?? d.verdict}` : 'Read a chart', at: latest.at }
    case 'sealed':
      return { state: 'sealed', line: sym ? `Sealed a ${sym} call` : 'Sealed a call', at: latest.at }
    case 'resolved': {
      const o = String(d.outcome)
      const word = d.kind === 'setup' ? o.toUpperCase() : o === 'win' ? 'right' : o === 'loss' ? 'wrong' : o
      return { state: 'waiting', line: `${sym} call opened: ${word}`, at: latest.at }
    }
    case 'forfeited':
      return { state: 'waiting', line: 'Missed a reveal (counts as a loss)', at: latest.at }
    case 'answered':
      if (latest.masked) return { state: 'answering', line: d.paid ? 'Answered a question' : `Called ${sym ?? 'a coin'} · ${d.horizon}`, at: latest.at }
      return { state: 'answering', line: `Called ${sym} ${d.direction} · ${d.horizon}`, at: latest.at }
    case 'skipped':
      return { state: 'waiting', line: sym ? `Passed on ${sym}` : 'Passed on a setup', at: latest.at }
    default:
      return { state: 'idle', line: 'Idle', at: latest.at }
  }
}

export function radarFor(agentId: number, viewer: string | null = null): RadarRow[] {
  const row = getDb().select().from(schema.kv).where(eq(schema.kv.key, `radar:${agentId}`)).get()
  if (!row) return []
  const rows = JSON.parse(row.value) as RadarRow[]
  const agent = getDb().select({ creator: schema.agents.creator }).from(schema.agents).where(eq(schema.agents.id, agentId)).get()
  const canSee = viewer != null && (agent?.creator.toLowerCase() === viewer || isSubscriber(agentId, viewer))
  const sealed = sealedFor(agentId)
  return rows
    .map(r => (r.state === 'firing' && !canSee && r.symbol && sealed.has(r.symbol) ? { ...r, symbol: null, ref: '' } : r))
    .sort((a, b) => stateRank(b.state) - stateRank(a.state) || b.score - a.score)
}

const stateRank = (s: RadarRow['state']) => ({ firing: 3, close: 2, watching: 1, quiet: 0 })[s]

/** The economy strip: what has moved through Presage, read from the chain's events. */
export function economy() {
  const db = getDb()
  const day = Math.floor(Date.now() / 1000) - 86_400
  const paid = db.select({ args: schema.chainEvents.args, name: schema.chainEvents.name }).from(schema.chainEvents).where(inArray(schema.chainEvents.name, ['CallPaid', 'Subscribed'])).all()
  const price = metisUsd()
  let settledUsd = 0
  let payers = new Set<string>()
  for (const e of paid) {
    const a = JSON.parse(e.args) as { token: string; amount: string; payer?: string; subscriber?: string }
    const amount = BigInt(a.amount)
    const native = /^0x0{40}$/.test(a.token)
    settledUsd += native ? (Number(amount) / 1e18) * (price ?? 0) : Number(amount) / 1e6
    payers.add((a.payer ?? a.subscriber ?? '').toLowerCase())
  }
  payers.delete('')
  const now = Math.floor(Date.now() / 1000)
  const subs = db.select({ n: sql<number>`count(*)` }).from(schema.subscriptions).where(gt(schema.subscriptions.until, now)).get()
  const sealedToday = db.select({ n: sql<number>`count(*)` }).from(schema.calls).where(and(inArray(schema.calls.status, ['sealed', 'revealed', 'forfeited']), gt(schema.calls.issuedAt, day))).get()
  const creators = db.select({ n: sql<number>`count(distinct creator)` }).from(schema.agents).where(eq(schema.agents.house, false)).get()
  const events24h = db.select({ n: sql<number>`count(*)` }).from(schema.agentEvents).where(gt(schema.agentEvents.at, day)).get()
  return {
    settledUsd: Math.round(settledUsd * 100) / 100,
    wallets: payers.size,
    subscriptions: subs?.n ?? 0,
    sealedToday: sealedToday?.n ?? 0,
    creators: creators?.n ?? 0,
    actions24h: events24h?.n ?? 0,
    metisUsd: price,
  }
}
