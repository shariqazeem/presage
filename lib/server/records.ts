import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { parsePayload, type CallPayload } from '../calls/payload'

import { RECORD_BAR, recordReady, scoreCalls, type AgentSummary, type CallRow, type Record_ } from '../records'

export { RECORD_BAR, recordReady, scoreCalls }
export type { AgentSummary, Record_ }

export function listAgents(): AgentSummary[] {
  const db = getDb()
  const agents = db.select().from(schema.agents).all()
  const calls = db
    .select({
      agentId: schema.calls.agentId,
      status: schema.calls.status,
      outcome: schema.calls.outcome,
      result: schema.calls.result,
      issuedAt: schema.calls.issuedAt,
      kind: schema.calls.kind,
      revealedAt: schema.calls.revealedAt,
      revealBy: schema.calls.revealBy,
    })
    .from(schema.calls)
    .all()
  const now = Math.floor(Date.now() / 1000)
  const subs = db
    .select({ agentId: schema.subscriptions.agentId, n: sql<number>`count(*)` })
    .from(schema.subscriptions)
    .where(gt(schema.subscriptions.until, now))
    .groupBy(schema.subscriptions.agentId)
    .all()
  return agents
    .map(a => {
      const record = scoreCalls(calls.filter(c => c.agentId === a.id))
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        kind: a.kind,
        house: a.house,
        creator: a.creator,
        description: a.description,
        priceUsd6: a.priceUsd6,
        callPriceUsd6: a.callPriceUsd6,
        registeredAt: a.registeredAt,
        registeredTx: a.registeredTx,
        retired: a.retired,
        specHash: a.specHash,
        record,
        recordReady: recordReady(record),
        subscribers: subs.find(s => s.agentId === a.id)?.n ?? 0,
      }
    })
    .sort((x, y) => Number(y.house) - Number(x.house) || y.record.resolved - x.record.resolved)
}

export function getAgent(slugOrId: string): AgentSummary | null {
  return listAgents().find(a => a.slug === slugOrId || String(a.id) === slugOrId) ?? null
}

export function agentsByCreator(creator: string): AgentSummary[] {
  return listAgents().filter(a => a.creator.toLowerCase() === creator.toLowerCase())
}

/** A call as the public sees it. A sealed call shows only its fingerprint until it is revealed. */
export type CallView = {
  id: number
  chainCallId: number | null
  agentId: number
  agentName: string
  agentSlug: string
  kind: 'direction' | 'setup'
  status: CallRow['status']
  sealTx: string | null
  sealedAt: number | null
  revealBy: number
  commitment: string
  issuedAt: number
  outcome: CallRow['outcome']
  result: number | null
  revealTx: string | null
  revealedAt: number | null
  settleTx: string | null
  resolution: unknown
  /** Present when revealed, or for a viewer allowed to see it early. */
  payload: CallPayload | null
  payloadJson: string | null
  salt: string | null
  asset: string | null
  side: string | null
  hidden: boolean
}

export function isSubscriber(agentId: number, wallet: string | null): boolean {
  if (!wallet) return false
  const now = Math.floor(Date.now() / 1000)
  return Boolean(
    getDb()
      .select({ u: schema.subscriptions.until })
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.agentId, agentId), eq(schema.subscriptions.subscriber, wallet.toLowerCase()), gt(schema.subscriptions.until, now)))
      .get(),
  )
}

export function toView(
  c: CallRow,
  agent: { name: string; slug: string; creator?: string } | undefined,
  opts: { viewer?: string | null; requestSecretOk?: boolean } = {},
): CallView {
  const revealed = c.status === 'revealed'
  const viewer = opts.viewer?.toLowerCase() ?? null
  const canSee =
    revealed ||
    opts.requestSecretOk === true ||
    (viewer != null && (agent?.creator?.toLowerCase() === viewer || isSubscriber(c.agentId, viewer)))
  const payload = canSee ? parsePayload(c.payload) : null
  return {
    id: c.id,
    chainCallId: c.chainCallId,
    agentId: c.agentId,
    agentName: agent?.name ?? `Agent ${c.agentId}`,
    agentSlug: agent?.slug ?? String(c.agentId),
    kind: c.kind,
    status: c.status,
    sealTx: c.sealTx,
    sealedAt: c.sealedAt,
    revealBy: c.revealBy,
    commitment: c.commitment,
    issuedAt: c.issuedAt,
    outcome: c.outcome,
    result: c.result,
    revealTx: c.revealTx,
    revealedAt: c.revealedAt,
    settleTx: c.settleTx,
    resolution: c.resolution ? JSON.parse(c.resolution) : null,
    payload,
    payloadJson: revealed ? c.payload : null,
    salt: revealed ? c.salt : null,
    asset: canSee ? c.asset : null,
    side: canSee ? c.side : null,
    hidden: !canSee,
  }
}

export function recentCalls(opts: { agentId?: number; limit?: number; viewer?: string | null; statuses?: CallRow['status'][] } = {}): CallView[] {
  const db = getDb()
  const statuses = opts.statuses ?? ['sealed', 'revealed', 'forfeited']
  const where = opts.agentId != null ? and(eq(schema.calls.agentId, opts.agentId), inArray(schema.calls.status, statuses)) : inArray(schema.calls.status, statuses)
  const rows = db.select().from(schema.calls).where(where).orderBy(desc(schema.calls.issuedAt)).limit(opts.limit ?? 50).all()
  const agents = db.select().from(schema.agents).all()
  return rows.map(r => toView(r, agents.find(a => a.id === r.agentId), { viewer: opts.viewer }))
}

export function getCall(id: number, viewer?: string | null): CallView | null {
  const db = getDb()
  const row = db.select().from(schema.calls).where(eq(schema.calls.id, id)).get()
  if (!row || row.status === 'pending' || row.status === 'failed') return null
  const agent = db.select().from(schema.agents).where(eq(schema.agents.id, row.agentId)).get()
  return toView(row, agent, { viewer })
}

export function platformStats() {
  const db = getDb()
  const all = db
    .select({ status: schema.calls.status, outcome: schema.calls.outcome, result: schema.calls.result, issuedAt: schema.calls.issuedAt, kind: schema.calls.kind })
    .from(schema.calls)
    .all()
  const r = scoreCalls(all)
  const paid = db.select({ n: sql<number>`count(*)` }).from(schema.oracleRequests).where(inArray(schema.oracleRequests.status, ['sealed'])).get()
  const agents = db.select({ n: sql<number>`count(*)` }).from(schema.agents).get()
  const events = db.select({ n: sql<number>`count(*)` }).from(schema.chainEvents).get()
  return {
    callsSealed: r.calls,
    resolved: r.resolved,
    open: r.open,
    wins: r.wins,
    losses: r.losses,
    forfeited: r.forfeited,
    paidCalls: paid?.n ?? 0,
    agents: agents?.n ?? 0,
    onChainEvents: events?.n ?? 0,
  }
}

export function describePayload(p: CallPayload): string {
  return p.rules === 'presage/setup-v1'
    ? `${p.asset.symbol} long · entry ${p.entry.price} · stop ${p.stop} · target ${p.target}`
    : `${p.asset.symbol} ${p.direction} over ${p.horizonSec / 3600}h · ${p.confidence}%`
}
