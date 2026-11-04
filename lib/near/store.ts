import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { USDC, coinById, tokenById, type Coin } from './config'
import { fromUnits } from './units'
import { vault, type Member, type VaultEvent } from './vault'

/** What the agent and the web app both read and write about ParallaxPay on NEAR. */

const now = () => Math.floor(Date.now() / 1000)

export type FeedKind = (typeof schema.nearFeed.$inferInsert)['kind']

/** A line in the feed. `accountId` makes it private to that member; `actor` is who is speaking. */
export function feed(kind: FeedKind, text: string, opts: { accountId?: string; coin?: string; tx?: string; actor?: string } = {}) {
  getDb()
    .insert(schema.nearFeed)
    .values({ at: now(), kind, text, accountId: opts.accountId ?? null, coin: opts.coin ?? null, tx: opts.tx ?? null, actor: opts.actor ?? null })
    .run()
}

export type FeedLine = { id: number; at: number; kind: FeedKind; text: string; coin: string | null; tx: string | null; actor: string | null; mine: boolean }

/** The market-wide feed, plus one member's own lines when `accountId` is given. Newest first. */
export function feedFor(accountId: string | null, limit = 40): FeedLine[] {
  const f = schema.nearFeed
  return getDb()
    .select()
    .from(f)
    .where(accountId ? or(isNull(f.accountId), eq(f.accountId, accountId)) : isNull(f.accountId))
    .orderBy(desc(f.id))
    .limit(limit)
    .all()
    .map(r => ({ id: r.id, at: r.at, kind: r.kind, text: r.text, coin: r.coin, tx: r.tx, actor: r.actor, mine: r.accountId != null }))
}

/** Reads one member from the vault into the agent's list. Null if they aren't a member (any more). */
export async function syncMember(accountId: string): Promise<Member | null> {
  const member = await vault.member(accountId)
  const db = getDb()
  const row = db.select().from(schema.nearMembers).where(eq(schema.nearMembers.accountId, accountId)).get()
  if (!row && !member) return null
  sayWhatChanged(accountId, row?.member ? (JSON.parse(row.member) as Member) : null, member)
  if (row) db.update(schema.nearMembers).set({ member: member ? JSON.stringify(member) : null, syncedAt: now() }).where(eq(schema.nearMembers.accountId, accountId)).run()
  else db.insert(schema.nearMembers).values({ accountId, member: JSON.stringify(member), joinedAt: now(), syncedAt: now() }).run()
  return member
}

const STYLE = ['calm', 'balanced', 'bold']

/** A member's own moves, said on the public floor: joining, switching modes, adding or taking out funds. */
function sayWhatChanged(accountId: string, before: Member | null, after: Member | null) {
  const say = (text: string) => feed('member', text, { actor: accountId })
  if (!before && after) {
    say(`${accountId} joined: ${after.rules.autopilot ? 'autopilot' : 'ask first'}, ${STYLE[after.rules.style] ?? 'balanced'}, ${coinList(after.rules.coins)}.`)
    return
  }
  if (before && !after) return say(`${accountId} left and took their storage deposit back.`)
  if (!before || !after) return
  if (before.rules.autopilot !== after.rules.autopilot) say(after.rules.autopilot ? `${accountId} turned on autopilot.` : `${accountId} switched to ask first.`)
  else if (before.rules.style !== after.rules.style || before.rules.coins.join() !== after.rules.coins.join()) say(`${accountId} changed their rules: ${STYLE[after.rules.style] ?? 'balanced'}, ${coinList(after.rules.coins)}.`)
}

/** Deposits and withdrawals, from the vault's own events in a member's transaction (read back from NEAR). */
export function announce(accountId: string, events: VaultEvent[]) {
  for (const e of events) {
    const amount = Number(e.data.amount ?? 0)
    const token = tokenById(String(e.data.token ?? ''))
    if (!token || e.data.account_id !== accountId) continue
    const shown = token.id === USDC.id ? money(fromUnits(String(e.data.amount), token.decimals)) : `${Number(fromUnits(String(e.data.amount), token.decimals).toPrecision(4))} ${token.symbol}`
    if (e.event === 'deposit' && amount > 0) feed('member', `${accountId} added ${shown}.`, { actor: accountId })
    if (e.event === 'withdraw' && amount > 0) feed('member', `${accountId} withdrew ${shown} to their wallet.`, { actor: accountId })
  }
}

const coinList = (ids: string[]) => ids.map(id => coinById(id)?.symbol ?? id).join(' and ') || 'no coins yet'

export type PositionRow = typeof schema.nearPositions.$inferSelect

export type Plan = {
  v: 1
  rules: 'parallaxpay/near-trade-v1'
  vault: string
  account: string
  coin: { symbol: string; token: string; market: string }
  side: 'buy'
  usdc: string
  entry: { type: 'market'; priceAtIssue: number; quoteOut: string }
  stop: number
  target: number
  r1: number | null
  maxHoldSec: number
  conviction: number
  issuedAt: number
  why: string[]
  analyst: { provider: 'near-ai'; model: string; chatId: string; signature: { text: string; signature: string; signing_address: string; signing_algo: string } | null } | { provider: 'rules' }
}

export type PositionView = {
  id: number
  accountId: string
  coin: string
  token: string
  mode: 'autopilot' | 'ask'
  status: PositionRow['status']
  callId: number | null
  hash: string
  /** The exact sealed JSON, once opened, byte for byte as it was hashed. */
  planJson: string | null
  /** The plan, once it has been opened on NEAR (or always, for the member it belongs to). */
  plan: Plan | null
  /** The seal's salt, public once the plan is opened: sha256(salt ‖ plan) must equal `hash`. */
  salt: string | null
  opened: boolean
  usdcIn: number
  /** Base units, for building the member's own transactions. */
  usdcInRaw: string
  coinAmount: number | null
  coinAmountRaw: string | null
  entryPrice: number | null
  exitPrice: number | null
  usdcOut: number | null
  pnlUsd: number | null
  pnlPct: number | null
  stop: number
  target: number
  exitReason: string | null
  exitProposed: boolean
  createdAt: number
  openedAt: number | null
  closedAt: number | null
  txs: { seal: string | null; entry: string | null; exit: string | null; reveal: string | null }
}

export function toView(p: PositionRow, viewer?: string | null): PositionView {
  const coin = coinById(p.coin)
  const usdcIn = fromUnits(p.usdcIn, USDC.decimals)
  const usdcOut = p.usdcOut ? fromUnits(p.usdcOut, USDC.decimals) : null
  const showPlan = p.revealTx != null || (viewer != null && viewer === p.accountId)
  return {
    id: p.id,
    accountId: p.accountId,
    coin: coin?.symbol ?? p.coin,
    token: p.coin,
    mode: p.mode,
    status: p.status,
    callId: p.callId,
    hash: p.hash,
    planJson: p.revealTx != null ? p.plan : null,
    plan: showPlan ? (JSON.parse(p.plan) as Plan) : null,
    salt: p.revealTx != null ? p.salt : null,
    opened: p.revealTx != null,
    usdcIn,
    usdcInRaw: p.usdcIn ?? '0',
    coinAmount: p.coinAmount && coin ? fromUnits(p.coinAmount, coin.decimals) : null,
    coinAmountRaw: p.coinAmount,
    entryPrice: p.entryPrice,
    exitPrice: p.exitPrice,
    usdcOut,
    pnlUsd: usdcOut != null ? usdcOut - usdcIn : null,
    pnlPct: usdcOut != null && usdcIn > 0 ? usdcOut / usdcIn - 1 : null,
    stop: showPlan ? p.stop : 0,
    target: showPlan ? p.target : 0,
    exitReason: p.exitReason,
    exitProposed: p.exitProposedAt != null && p.status === 'open',
    createdAt: p.createdAt,
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    txs: { seal: p.sealTx, entry: p.entryTx, exit: p.exitTx, reveal: p.revealTx },
  }
}

export function positionsFor(accountId: string, limit = 30): PositionView[] {
  return getDb()
    .select()
    .from(schema.nearPositions)
    .where(eq(schema.nearPositions.accountId, accountId))
    .orderBy(desc(schema.nearPositions.id))
    .limit(limit)
    .all()
    .map(p => toView(p, accountId))
}

/** Every idea the agent acted on, for the public record. Proposals nobody approved count too. */
export function allPositions(limit = 100): PositionView[] {
  return getDb()
    .select()
    .from(schema.nearPositions)
    .where(inArray(schema.nearPositions.status, ['open', 'closed', 'not_filled', 'declined']))
    .orderBy(desc(schema.nearPositions.id))
    .limit(limit)
    .all()
    .map(p => toView(p))
}

export function positionRow(id: number): PositionRow | undefined {
  return getDb().select().from(schema.nearPositions).where(eq(schema.nearPositions.id, id)).get()
}

/** Marks a position open with what the vault actually filled. */
export function markOpen(p: { id: number }, coin: Coin, usdcIn: bigint, coinOut: bigint, tx: string) {
  const price = fromUnits(usdcIn, USDC.decimals) / fromUnits(coinOut, coin.decimals)
  getDb()
    .update(schema.nearPositions)
    .set({ status: 'open', usdcIn: usdcIn.toString(), coinAmount: coinOut.toString(), entryPrice: price, entryTx: tx, openedAt: now() })
    .where(eq(schema.nearPositions.id, p.id))
    .run()
  return price
}

/** Marks a position closed with what the vault actually got back, and says so in the feed. */
export function closePosition(p: PositionRow, coin: Coin, sold: bigint, usdcOut: bigint, tx: string, reason: string) {
  const price = fromUnits(usdcOut, USDC.decimals) / fromUnits(sold, coin.decimals)
  getDb()
    .update(schema.nearPositions)
    .set({ status: 'closed', usdcOut: usdcOut.toString(), exitPrice: price, exitTx: tx, exitReason: reason, closedAt: now() })
    .where(eq(schema.nearPositions.id, p.id))
    .run()
  const held = BigInt(p.coinAmount ?? '0')
  const spent = fromUnits(p.usdcIn, USDC.decimals) * (held > 0n ? Number((sold * 1_000_000n) / held) / 1_000_000 : 1)
  const back = fromUnits(usdcOut, USDC.decimals)
  const pnl = back - spent
  const pct = spent > 0 ? ((back / spent - 1) * 100).toFixed(1) : '0.0'
  feed('exit', `Sold ${coin.symbol} at ${money(price)}: ${reason}. ${pnl >= 0 ? 'Up' : 'Down'} ${money(Math.abs(pnl))} (${pct}%).`, {
    accountId: p.accountId,
    coin: coin.id,
    tx,
    actor: 'parallaxpay',
  })
  // The floor hears about every exit, without the member's name or size.
  feed('exit', `Sold ${coin.symbol} at ${money(price)} for a member: ${reason}. ${Number(pct) >= 0 ? '+' : ''}${pct}%.`, { coin: coin.id, tx, actor: 'parallaxpay' })
}

export function money(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (n >= 10) return `$${n.toFixed(2)}`
  return `$${n.toFixed(n >= 1 ? 3 : 4)}`
}

/** The agent's latest read of each coin, saved by the engine. */
export function latestReads(): Record<string, unknown>[] {
  return getDb()
    .select()
    .from(schema.kv)
    .all()
    .filter(r => r.key.startsWith('near:read:'))
    .map(r => JSON.parse(r.value) as Record<string, unknown>)
}

/** The record in numbers: closed trades, wins, and the sum of what they made or lost. */
export function recordStats() {
  const closed = getDb()
    .select()
    .from(schema.nearPositions)
    .where(and(eq(schema.nearPositions.status, 'closed')))
    .all()
    .map(p => toView(p))
    .filter(p => p.pnlUsd != null)
  const wins = closed.filter(p => (p.pnlUsd ?? 0) > 0).length
  return {
    closed: closed.length,
    wins,
    pnlUsd: closed.reduce((s, p) => s + (p.pnlUsd ?? 0), 0),
    avgPct: closed.length ? closed.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / closed.length : null,
  }
}
