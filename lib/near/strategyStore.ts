import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { toView, type Plan, type PositionView } from './store'
import { HOUSE, HOUSE_ID, HOUSE_NAME, canonical, validBlocks, type Blocks } from './strategy'

/**
 * Strategies on the server: which one each member's agent runs, the ones members made, and each one's
 * record from real, sealed trades. The house strategy is the default and isn't stored.
 */

export type StrategyRow = { id: string; name: string; owner: string | null; blocks: Blocks; hash: string; public: boolean; adopted: boolean; createdAt: number }

export const blocksHash = (b: Blocks) => createHash('sha256').update(canonical(b)).digest('hex')

export const HOUSE_STRATEGY: StrategyRow = { id: HOUSE_ID, name: HOUSE_NAME, owner: null, blocks: HOUSE, hash: blocksHash(HOUSE), public: true, adopted: false, createdAt: 0 }

function fromRow(r: typeof schema.nearStrategies.$inferSelect): StrategyRow | null {
  const blocks = validBlocks(JSON.parse(r.blocks))
  if (!blocks) return null
  return { id: r.id, name: r.name, owner: r.owner, blocks, hash: r.hash, public: r.public === 1, adopted: r.adopted === 1, createdAt: r.createdAt }
}

export function getStrategy(id: string): StrategyRow | null {
  if (id === HOUSE_ID) return HOUSE_STRATEGY
  const r = getDb().select().from(schema.nearStrategies).where(eq(schema.nearStrategies.id, id)).get()
  return r ? fromRow(r) : null
}

/** The strategy a member's agent runs: theirs, or the house one. */
export function strategyFor(accountId: string): StrategyRow {
  const r = getDb().select().from(schema.nearMemberStrategy).where(eq(schema.nearMemberStrategy.accountId, accountId)).get()
  return (r && getStrategy(r.strategyId)) || HOUSE_STRATEGY
}

export function setMemberStrategy(accountId: string, strategyId: string) {
  const db = getDb()
  if (strategyId === HOUSE_ID) {
    db.delete(schema.nearMemberStrategy).where(eq(schema.nearMemberStrategy.accountId, accountId)).run()
    return
  }
  const at = Math.floor(Date.now() / 1000)
  db.insert(schema.nearMemberStrategy).values({ accountId, strategyId, setAt: at }).onConflictDoUpdate({ target: schema.nearMemberStrategy.accountId, set: { strategyId, setAt: at } }).run()
}

/**
 * Saves a member's own strategy and puts it on their agent. The same owner saving the same blocks again
 * updates that strategy's name and visibility rather than making a copy; the house blocks are the house.
 */
export function saveStrategy(a: { owner: string; name: string; blocks: Blocks; words?: string | null; publish: boolean }): StrategyRow {
  const hash = blocksHash(a.blocks)
  if (hash === HOUSE_STRATEGY.hash) {
    setMemberStrategy(a.owner, HOUSE_ID)
    return HOUSE_STRATEGY
  }
  const db = getDb()
  const name = a.name.trim().slice(0, 40) || 'My strategy'
  const mine = db
    .select()
    .from(schema.nearStrategies)
    .where(and(eq(schema.nearStrategies.owner, a.owner), eq(schema.nearStrategies.hash, hash)))
    .get()
  let id: string
  if (mine) {
    id = mine.id
    db.update(schema.nearStrategies)
      .set({ name, public: a.publish ? 1 : 0, ...(a.words ? { words: a.words.slice(0, 600) } : {}) })
      .where(eq(schema.nearStrategies.id, id))
      .run()
  } else {
    id = `s_${randomBytes(5).toString('hex')}`
    db.insert(schema.nearStrategies)
      .values({ id, name, owner: a.owner, blocks: canonical(a.blocks), hash, words: a.words?.slice(0, 600) ?? null, public: a.publish ? 1 : 0, createdAt: Math.floor(Date.now() / 1000) })
      .run()
  }
  setMemberStrategy(a.owner, id)
  return getStrategy(id)!
}

/** Every strategy some member's agent runs right now, with the house one always first. */
export function strategiesInUse(): StrategyRow[] {
  const ids = [...new Set(getDb().select({ id: schema.nearMemberStrategy.strategyId }).from(schema.nearMemberStrategy).all().map(r => r.id))]
  const rows = ids.length ? getDb().select().from(schema.nearStrategies).where(inArray(schema.nearStrategies.id, ids)).all() : []
  return [HOUSE_STRATEGY, ...rows.map(fromRow).filter((s): s is StrategyRow => s != null)]
}

/** The strategies on the board: the house one and every strategy its owner chose to show. */
export function publicStrategies(): StrategyRow[] {
  const rows = getDb().select().from(schema.nearStrategies).where(eq(schema.nearStrategies.public, 1)).all()
  return [HOUSE_STRATEGY, ...rows.map(fromRow).filter((s): s is StrategyRow => s != null)]
}

export type StrategyRecord = { trades: number; wins: number; avgPct: number | null; pnlUsd: number; open: number; members: number; lastAt: number | null }

const strategyOfPlan = (json: string): string => {
  try {
    return (JSON.parse(json) as Plan).strategy?.id ?? HOUSE_ID
  } catch {
    return HOUSE_ID
  }
}

/** Each strategy's record from real trades: closed ones count, open ones are shown as open. */
export function strategyRecords(): Map<string, StrategyRecord> {
  const db = getDb()
  const out = new Map<string, StrategyRecord>()
  const rec = (id: string) => {
    let r = out.get(id)
    if (!r) out.set(id, (r = { trades: 0, wins: 0, avgPct: null, pnlUsd: 0, open: 0, members: 0, lastAt: null }))
    return r
  }
  const sums = new Map<string, number>()
  const rows = db
    .select({ plan: schema.nearPositions.plan, status: schema.nearPositions.status, usdcIn: schema.nearPositions.usdcIn, usdcOut: schema.nearPositions.usdcOut, closedAt: schema.nearPositions.closedAt, openedAt: schema.nearPositions.openedAt })
    .from(schema.nearPositions)
    .where(inArray(schema.nearPositions.status, ['open', 'closed']))
    .all()
  for (const p of rows) {
    const id = strategyOfPlan(p.plan)
    const r = rec(id)
    if (p.status === 'open') {
      r.open++
      r.lastAt = Math.max(r.lastAt ?? 0, p.openedAt ?? 0)
      continue
    }
    const inUsd = Number(p.usdcIn ?? 0) / 1e6
    const outUsd = Number(p.usdcOut ?? 0) / 1e6
    if (!(inUsd > 0) || p.usdcOut == null) continue
    r.trades++
    if (outUsd > inUsd) r.wins++
    r.pnlUsd += outUsd - inUsd
    sums.set(id, (sums.get(id) ?? 0) + (outUsd / inUsd - 1))
    r.lastAt = Math.max(r.lastAt ?? 0, p.closedAt ?? 0)
  }
  for (const [id, r] of out) r.avgPct = r.trades ? (sums.get(id) ?? 0) / r.trades : null
  // How many members' agents run each strategy now.
  const assigned = db.select({ id: schema.nearMemberStrategy.strategyId }).from(schema.nearMemberStrategy).all()
  const members = db.select({ accountId: schema.nearMembers.accountId }).from(schema.nearMembers).all().length
  for (const a of assigned) rec(a.id).members++
  rec(HOUSE_ID).members = Math.max(0, members - assigned.length)
  return out
}

/** A strategy's real trades, newest first. Plans stay sealed until they're opened, as everywhere else. */
export function strategyTrades(id: string, limit = 30): PositionView[] {
  return getDb()
    .select()
    .from(schema.nearPositions)
    .where(inArray(schema.nearPositions.status, ['open', 'closed']))
    .orderBy(desc(schema.nearPositions.id))
    .limit(500)
    .all()
    .filter(p => strategyOfPlan(p.plan) === id)
    .slice(0, limit)
    .map(p => toView(p))
}
