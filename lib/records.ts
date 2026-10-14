import type { schema } from './db/schema-types'

export const RECORD_BAR = { calls: 10, days: 7 } as const

export type Record_ = {
  calls: number
  open: number
  wins: number
  losses: number
  flats: number
  noFills: number
  forfeited: number
  resolved: number
  /** wins / (wins + losses + forfeited). A hidden call counts as a loss. */
  hitRate: number | null
  /** Setups: average R with forfeits as -1R. Direction: average basis points in the called direction. */
  avgResult: number | null
  firstCallAt: number | null
  lastCallAt: number | null
}

export type AgentSummary = {
  id: number
  slug: string
  name: string
  kind: 'direction' | 'setup'
  house: boolean
  creator: string
  description: string
  priceUsd6: number
  callPriceUsd6: number
  registeredAt: number | null
  registeredTx: string | null
  retired: boolean
  specHash: string
  record: Record_
  recordReady: boolean
  subscribers: number
}

export type CallRow = typeof schema.calls.$inferSelect

export function scoreCalls(rows: Pick<CallRow, 'status' | 'outcome' | 'result' | 'issuedAt' | 'kind'>[]): Record_ {
  const r: Record_ = {
    calls: 0,
    open: 0,
    wins: 0,
    losses: 0,
    flats: 0,
    noFills: 0,
    forfeited: 0,
    resolved: 0,
    hitRate: null,
    avgResult: null,
    firstCallAt: null,
    lastCallAt: null,
  }
  let sum = 0
  let counted = 0
  for (const c of rows) {
    if (c.status === 'failed' || c.status === 'pending') continue
    r.calls++
    r.firstCallAt = r.firstCallAt == null ? c.issuedAt : Math.min(r.firstCallAt, c.issuedAt)
    r.lastCallAt = r.lastCallAt == null ? c.issuedAt : Math.max(r.lastCallAt, c.issuedAt)
    if (c.status === 'sealed') {
      r.open++
      continue
    }
    r.resolved++
    if (c.status === 'forfeited') {
      r.forfeited++
      if (c.kind === 'setup') {
        sum -= 100
        counted++
      }
      continue
    }
    if (c.outcome === 'win') r.wins++
    else if (c.outcome === 'loss') r.losses++
    else if (c.outcome === 'flat') r.flats++
    else if (c.outcome === 'nofill') r.noFills++
    if (c.outcome !== 'nofill' && c.result != null) {
      sum += c.result
      counted++
    }
  }
  const decided = r.wins + r.losses + r.forfeited
  r.hitRate = decided ? r.wins / decided : null
  r.avgResult = counted ? sum / counted : null
  return r
}

export function recordReady(r: Record_, now = Date.now() / 1000): boolean {
  return r.resolved >= RECORD_BAR.calls && r.firstCallAt != null && now - r.firstCallAt >= RECORD_BAR.days * 86_400
}

