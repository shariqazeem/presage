import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb, schema } from '../../lib/db'
import { COINS, USDC, USDC_ID, VAULT_ID, coinById, feedName, type Coin } from '../../lib/near/config'
import { quoteBuy, quoteSell } from '../../lib/near/rhea'
import { fromUnits, lessBps } from '../../lib/near/units'
import { closePosition, feed, markOpen, syncMember, type Plan, type PositionRow } from '../../lib/near/store'
import { allowsCoin, tradeEnd, vault, type Member } from '../../lib/near/vault'
import { errMsg, log } from '../log'
import { review, type Verdict } from './analyst'
import { exitReason, readCoin, usd, type Read, type Setup } from './brain'
import { agentCall, agentConfigured } from './signer'
import { V2_DEFAULTS } from './strategy'
import { renderChart } from '../stquant/charts.js'

const l = log('near')

/** How far below the quote a swap may fill before the vault refuses it. */
const SLIPPAGE_BPS = Number(process.env.NEAR_SLIPPAGE_BPS ?? 80)
// The same time limit the v2 history test used.
const MAX_HOLD_SEC = V2_DEFAULTS.maxHoldHours * 3600
const MIN_TRADE = 1_000_000n // $1
/** How long an "ask first" proposal waits for the member. */
export const PROPOSAL_TTL_SEC = 30 * 60
/** How much of a member's largest trade each grade gets, by style. A grade a style doesn't list is passed. */
const SIZE: Record<number, Record<number, number>> = {
  0: { 5: 1 },
  1: { 5: 1, 4: 0.7 },
  2: { 5: 1, 4: 0.7, 3: 0.5 },
}
export const STYLE_NAMES = ['calm', 'balanced', 'bold'] as const

const now = () => Math.floor(Date.now() / 1000)
const CHART_DIR = resolve(process.env.PARALLAXPAY_CHART_DIR ?? 'var/charts')
const AGENT = { actor: 'parallaxpay' } as const

/**
 * The chart the agent just read (four timeframes, its levels, MFI), saved for the floor and for receipts.
 * For a coin's live read it also saves the candles it read, up to 500 per timeframe: the app draws its
 * window from them, and older ones when someone zooms out, so it shows exactly what the agent saw and
 * never has to fetch the same candles again (lib/near/snapshot.ts).
 */
function saveChart(read: Read, name: string) {
  try {
    mkdirSync(CHART_DIR, { recursive: true })
    writeFileSync(resolve(CHART_DIR, `${name}.png`), renderChart({ symbol: read.coin.symbol, frames: read.frames }))
    if (!name.includes('pos-')) {
      const f = read.frames
      const keep = <T,>(c: T[] | undefined) => (c ?? []).slice(-500)
      const body = JSON.stringify({ at: now(), frames: { '15m': keep(f.m15), '1h': keep(f.h1), '4h': keep(f.h4), '1d': keep(f.d1) } })
      const tmp = resolve(CHART_DIR, `.${name}.json.tmp`)
      writeFileSync(tmp, body)
      renameSync(tmp, resolve(CHART_DIR, `${name}.json`))
    }
  } catch (e) {
    l.warn(`chart ${name}: ${errMsg(e)}`)
  }
}

// ---------- members ----------

type Known = { accountId: string; member: Member }

function knownMembers(): Known[] {
  return getDb()
    .select()
    .from(schema.nearMembers)
    .where(isNotNull(schema.nearMembers.member))
    .all()
    .map(r => ({ accountId: r.accountId, member: JSON.parse(r.member!) as Member }))
}

export async function syncMembers() {
  for (const { accountId } of getDb().select({ accountId: schema.nearMembers.accountId }).from(schema.nearMembers).all()) {
    try {
      await syncMember(accountId)
    } catch (e) {
      l.warn(`sync ${accountId}: ${errMsg(e)}`)
    }
  }
}

const hasLiveIdea = (accountId: string, coin: string) =>
  getDb()
    .select({ id: schema.nearPositions.id })
    .from(schema.nearPositions)
    .where(and(eq(schema.nearPositions.accountId, accountId), eq(schema.nearPositions.coin, coin), inArray(schema.nearPositions.status, ['proposed', 'open'])))
    .get() != null

// ---------- the 15-minute check ----------

/** The latest read of each coin, for the desk. Frames stay out; they're large and the desk doesn't need them. */
function saveRead(r: Read) {
  const { frames: _f, coin, ...rest } = r
  const value = JSON.stringify({ ...rest, coin: coin.symbol, token: coin.id })
  getDb().insert(schema.kv).values({ key: `near:read:${coin.symbol}`, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run()
}

/** Only say "watching" again when the picture changed or an hour has passed, so the feed stays worth reading. */
function worthSaying(r: Read): boolean {
  const last = getDb()
    .select()
    .from(schema.nearFeed)
    .where(and(eq(schema.nearFeed.coin, r.coin.id), eq(schema.nearFeed.kind, 'watch')))
    .orderBy(desc(schema.nearFeed.id))
    .get()
  if (!last) return true
  const shape = (s: string) => s.replace(/\$[\d,.]+/g, '$').replace(/\d+(\.\d+)?%/g, '%')
  return shape(last.text) !== shape(r.line) || now() - last.at >= 3600
}

export async function checkMarkets() {
  for (const coin of COINS) {
    let read: Read
    try {
      read = await readCoin(coin)
    } catch (e) {
      l.warn(`read ${coin.symbol}: ${errMsg(e)}`)
      continue
    }
    saveRead(read)
    saveChart(read, `near-${coin.symbol}`)
    if (read.setup) await onSetup(read, read.setup)
    else if (worthSaying(read)) feed('watch', read.line, { coin: coin.id, ...AGENT })
  }
}

async function onSetup(read: Read, setup: Setup) {
  const coin = read.coin
  const room = knownMembers().filter(m => allowsCoin(m.member.rules, coin.id) && !hasLiveIdea(m.accountId, coin.id))
  if (!room.length) {
    feed('setup', `${read.line} Every member who trades ${coin.symbol} is already in it.`, { coin: coin.id, ...AGENT })
    return
  }
  feed('setup', read.line, { coin: coin.id, ...AGENT })
  const verdict = await review(read, setup)
  const byAnalyst = verdict.source.provider === 'near-ai'
  if (verdict.verdict !== 'BUY') {
    feed('pass', byAnalyst ? `Checked the ${coin.symbol} chart and passed: ${verdict.why}` : `Passed on ${coin.symbol}: ${verdict.why}`, { coin: coin.id, actor: byAnalyst ? 'analyst' : 'parallaxpay' })
    return
  }
  if (byAnalyst) feed('setup', `Checked the ${coin.symbol} chart: ${verdict.plain} Graded ${verdict.conviction}/5.`, { coin: coin.id, actor: 'analyst' })
  let bought = 0
  let asked = 0
  for (const m of room) {
    const share = SIZE[m.member.rules.style]?.[verdict.conviction]
    if (share == null) {
      feed('pass', `Passed on ${coin.symbol}: graded ${verdict.conviction}/5, and your ${STYLE_NAMES[m.member.rules.style] ?? 'chosen'} style waits for better.`, { accountId: m.accountId, coin: coin.id, ...AGENT })
      continue
    }
    try {
      if (m.member.rules.autopilot) bought += (await enter(m, read, setup, verdict, share)) ? 1 : 0
      else asked += (await propose(m, read, setup, verdict, share)) ? 1 : 0
    } catch (e) {
      l.error(`${coin.symbol} for ${m.accountId}: ${errMsg(e)}`)
      feed('error', `Couldn't act on ${coin.symbol}: ${errMsg(e)}`, { accountId: m.accountId, coin: coin.id, ...AGENT })
    }
  }
  const people = (n: number) => `${n} member${n === 1 ? '' : 's'}`
  if (bought) feed('enter', `Bought ${coin.symbol} for ${people(bought)} near ${usd(read.price)}. Each plan is sealed on NEAR.`, { coin: coin.id, ...AGENT })
  if (asked) feed('propose', `Asked ${people(asked)} to approve a ${coin.symbol} buy near ${usd(read.price)}.`, { coin: coin.id, ...AGENT })
}

/** The size for a member, or a reason there's none. */
function sizeFor(m: Known, share: number): bigint | string {
  const cash = BigInt(m.member.balances[USDC_ID] ?? '0')
  let amount = (BigInt(m.member.rules.max_trade) * BigInt(Math.round(share * 100))) / 100n
  if (amount > cash) amount = cash
  if (amount < MIN_TRADE) return `there's ${usd(fromUnits(cash, USDC.decimals))} USDC in the account`
  return amount
}

function seal(plan: Plan) {
  const json = JSON.stringify(plan)
  const salt = randomBytes(32)
  const hash = createHash('sha256').update(Buffer.concat([salt, Buffer.from(json, 'utf8')])).digest('hex')
  return { json, salt: salt.toString('hex'), hash }
}

function makePlan(m: Known, read: Read, setup: Setup, verdict: Verdict, usdcIn: bigint, quoteOut: bigint): Plan {
  return {
    v: 1,
    rules: 'parallaxpay/near-trade-v1',
    vault: VAULT_ID,
    account: m.accountId,
    coin: { symbol: read.coin.symbol, token: read.coin.id, market: feedName(read.coin) },
    side: 'buy',
    usdc: usdcIn.toString(),
    entry: { type: 'market', priceAtIssue: read.price, quoteOut: quoteOut.toString() },
    stop: setup.stop,
    target: setup.target,
    r1: setup.r1,
    maxHoldSec: MAX_HOLD_SEC,
    conviction: verdict.conviction,
    issuedAt: now(),
    why: [verdict.why, ...setup.reasons].filter(Boolean).slice(0, 6).map(s => s.slice(0, 240)),
    analyst: verdict.source,
  }
}

async function enter(m: Known, read: Read, setup: Setup, verdict: Verdict, share: number): Promise<boolean> {
  const coin = read.coin
  if (!agentConfigured()) return false
  if (m.member.buys_today >= m.member.rules.trades_per_day) {
    feed('pass', `Passed on ${coin.symbol}: today's ${m.member.rules.trades_per_day} buys are used.`, { accountId: m.accountId, coin: coin.id, ...AGENT })
    return false
  }
  const amount = sizeFor(m, share)
  if (typeof amount === 'string') {
    feed('pass', `Passed on ${coin.symbol}: ${amount}.`, { accountId: m.accountId, coin: coin.id, ...AGENT })
    return false
  }
  const quote = await quoteBuy(coin, amount)
  const plan = makePlan(m, read, setup, verdict, amount, quote)
  const sealed = seal(plan)
  // The plan and its salt are saved before the seal exists, so the call can always be opened.
  const pos = getDb()
    .insert(schema.nearPositions)
    .values({
      accountId: m.accountId,
      coin: coin.id,
      mode: 'autopilot',
      status: 'proposed',
      plan: sealed.json,
      salt: sealed.salt,
      hash: sealed.hash,
      stop: setup.stop,
      target: setup.target,
      r1: setup.r1,
      maxHoldSec: MAX_HOLD_SEC,
      usdcIn: amount.toString(),
      createdAt: now(),
    })
    .returning({ id: schema.nearPositions.id })
    .get()
  saveChart(read, `near-pos-${pos.id}`)
  const r = await agentCall('trade', {
    account_id: m.accountId,
    token_in: USDC_ID,
    token_out: coin.id,
    amount_in: amount.toString(),
    min_out: lessBps(quote, SLIPPAGE_BPS).toString(),
    seal: sealed.hash,
    call: null,
  })
  const callId = (r.events.find(e => e.event === 'seal')?.data.call as number | undefined) ?? null
  const end = tradeEnd(r.events)
  const db = getDb()
  if (end?.outcome === 'filled') {
    const got = BigInt(end.amount_out)
    db.update(schema.nearPositions).set({ callId, sealTx: r.hash }).where(eq(schema.nearPositions.id, pos.id)).run()
    const price = markOpen(pos, coin, amount, got, r.hash)
    feed('enter', `Bought ${fromUnits(got, coin.decimals).toPrecision(4)} ${coin.symbol} for ${usd(fromUnits(amount, USDC.decimals))} at ${usd(price)}. Stop ${usd(setup.stop)}, target ${usd(setup.target)}. The plan is sealed on NEAR as call #${callId}.`, {
      accountId: m.accountId,
      coin: coin.id,
      tx: r.hash,
      ...AGENT,
    })
    await syncMember(m.accountId)
    return true
  }
  db.update(schema.nearPositions).set({ status: 'not_filled', callId, sealTx: callId != null ? r.hash : null }).where(eq(schema.nearPositions.id, pos.id)).run()
  if (callId != null) {
    feed('note', `The ${coin.symbol} buy didn't fill: the price moved past the minimum. Nothing was spent.`, { accountId: m.accountId, coin: coin.id, tx: r.hash, ...AGENT })
    await openPlan(pos.id)
  } else {
    feed('error', `The ${coin.symbol} buy was refused: ${r.failure ?? 'unknown reason'}`, { accountId: m.accountId, coin: coin.id, tx: r.hash, ...AGENT })
  }
  return false
}

/** Ask first: seal the plan now and wait for the member to approve it from their wallet. */
async function propose(m: Known, read: Read, setup: Setup, verdict: Verdict, share: number): Promise<boolean> {
  const coin = read.coin
  if (!agentConfigured()) return false
  const amount = sizeFor(m, share)
  if (typeof amount === 'string') {
    feed('pass', `Passed on ${coin.symbol}: ${amount}.`, { accountId: m.accountId, coin: coin.id, ...AGENT })
    return false
  }
  const quote = await quoteBuy(coin, amount)
  const sealed = seal(makePlan(m, read, setup, verdict, amount, quote))
  const pos = getDb()
    .insert(schema.nearPositions)
    .values({
      accountId: m.accountId,
      coin: coin.id,
      mode: 'ask',
      status: 'proposed',
      plan: sealed.json,
      salt: sealed.salt,
      hash: sealed.hash,
      stop: setup.stop,
      target: setup.target,
      r1: setup.r1,
      maxHoldSec: MAX_HOLD_SEC,
      usdcIn: amount.toString(),
      createdAt: now(),
    })
    .returning({ id: schema.nearPositions.id })
    .get()
  saveChart(read, `near-pos-${pos.id}`)
  const r = await agentCall('seal', { account_id: m.accountId, hash: sealed.hash }, 30)
  const callId = typeof r.value === 'number' ? r.value : ((r.events.find(e => e.event === 'seal')?.data.call as number | undefined) ?? null)
  if (callId == null) {
    getDb().update(schema.nearPositions).set({ status: 'declined', exitReason: 'seal failed' }).where(eq(schema.nearPositions.id, pos.id)).run()
    feed('error', `Couldn't seal the ${coin.symbol} plan: ${r.failure ?? 'unknown reason'}`, { accountId: m.accountId, coin: coin.id, tx: r.hash, ...AGENT })
    return false
  }
  getDb().update(schema.nearPositions).set({ callId, sealTx: r.hash }).where(eq(schema.nearPositions.id, pos.id)).run()
  feed('propose', `Proposal: buy ${usd(fromUnits(amount, USDC.decimals))} of ${coin.symbol} near ${usd(read.price)}, stop ${usd(setup.stop)}, target ${usd(setup.target)}. Sealed as call #${callId}. Approve within 30 minutes.`, {
    accountId: m.accountId,
    coin: coin.id,
    tx: r.hash,
    ...AGENT,
  })
  return true
}

// ---------- exits ----------

export async function manageExits() {
  const db = getDb()
  const open = db.select().from(schema.nearPositions).where(eq(schema.nearPositions.status, 'open')).all()
  const reads = new Map<string, Read>()
  for (const pos of open) {
    const coin = coinById(pos.coin)
    if (!coin || pos.openedAt == null) continue
    let read = reads.get(coin.id)
    if (!read) {
      try {
        read = await readCoin(coin)
      } catch (e) {
        l.warn(`exit read ${coin.symbol}: ${errMsg(e)}`)
        continue
      }
      reads.set(coin.id, read)
    }
    const reason = exitReason({ stop: pos.stop, target: pos.target, r1: pos.r1, openedAt: pos.openedAt, maxHoldSec: pos.maxHoldSec }, read)
    if (!reason) continue
    try {
      const member = await syncMember(pos.accountId)
      if (pos.mode === 'autopilot' && member?.rules.autopilot) await exit(pos, coin, member, reason)
      else if (pos.exitProposedAt == null) {
        db.update(schema.nearPositions).set({ exitProposedAt: now(), exitReason: reason }).where(eq(schema.nearPositions.id, pos.id)).run()
        feed('propose', `Time to sell your ${coin.symbol}: ${reason}. Approve the sale from your desk.`, { accountId: pos.accountId, coin: coin.id, ...AGENT })
      }
    } catch (e) {
      l.error(`exit ${pos.id}: ${errMsg(e)}`)
    }
  }
  await expireProposals()
}

async function exit(pos: PositionRow, coin: Coin, member: Member, reason: string) {
  const held = BigInt(member.balances[coin.id] ?? '0')
  const want = BigInt(pos.coinAmount ?? '0')
  const amount = held < want ? held : want
  const db = getDb()
  if (amount === 0n) {
    db.update(schema.nearPositions).set({ status: 'closed', exitReason: 'the coins were moved out of the vault', closedAt: now() }).where(eq(schema.nearPositions.id, pos.id)).run()
    await openPlan(pos.id)
    return
  }
  const quote = await quoteSell(coin, amount)
  const r = await agentCall('trade', {
    account_id: pos.accountId,
    token_in: coin.id,
    token_out: USDC_ID,
    amount_in: amount.toString(),
    min_out: lessBps(quote, SLIPPAGE_BPS).toString(),
    seal: null,
    call: pos.callId,
  })
  const end = tradeEnd(r.events)
  if (end?.outcome !== 'filled') {
    feed('note', `Tried to sell ${coin.symbol} (${reason}) but the price moved past the minimum. Trying again shortly.`, { accountId: pos.accountId, coin: coin.id, tx: r.hash, ...AGENT })
    return
  }
  closePosition(pos, coin, amount, BigInt(end.amount_out), r.hash, reason)
  await openPlan(pos.id)
  await syncMember(pos.accountId)
}

/** Opens a sealed plan on NEAR: the vault checks it against its seal and logs it. */
export async function openPlan(positionId: number) {
  const db = getDb()
  const pos = db.select().from(schema.nearPositions).where(eq(schema.nearPositions.id, positionId)).get()
  if (!pos || pos.callId == null || pos.revealTx) return
  try {
    const r = await agentCall('reveal', { call: pos.callId, salt: pos.salt, plan: pos.plan }, 30)
    if (!r.ok) throw new Error(r.failure ?? 'reveal failed')
    db.update(schema.nearPositions).set({ revealTx: r.hash }).where(eq(schema.nearPositions.id, pos.id)).run()
    feed('reveal', `Opened the sealed plan for call #${pos.callId}. It matches its seal.`, { accountId: pos.accountId, coin: pos.coin, tx: r.hash, ...AGENT })
  } catch (e) {
    l.error(`reveal ${pos.id}: ${errMsg(e)}`)
  }
}

async function expireProposals() {
  const db = getDb()
  const stale = db
    .select()
    .from(schema.nearPositions)
    .where(and(eq(schema.nearPositions.status, 'proposed'), eq(schema.nearPositions.mode, 'ask')))
    .all()
    .filter(p => now() - p.createdAt > PROPOSAL_TTL_SEC)
  for (const pos of stale) {
    db.update(schema.nearPositions).set({ status: 'declined', exitReason: 'not approved in time', closedAt: now() }).where(eq(schema.nearPositions.id, pos.id)).run()
    feed('note', `The ${coinById(pos.coin)?.symbol ?? ''} proposal expired. Its plan is opened so the record stays complete.`, { accountId: pos.accountId, coin: pos.coin, ...AGENT })
    await openPlan(pos.id)
  }
  // Plans that never got opened (a reveal that failed earlier) get another try.
  for (const pos of db
    .select()
    .from(schema.nearPositions)
    .where(and(inArray(schema.nearPositions.status, ['closed', 'not_filled', 'declined']), isNotNull(schema.nearPositions.callId)))
    .all()
    .filter(p => !p.revealTx)) {
    await openPlan(pos.id)
  }
}

/** If a trade stopped part-way (rare), settle it from what Rhea holds once the vault allows it. */
export async function recoverStuck() {
  if (!agentConfigured()) return
  const t = await vault.trade()
  if (!t || now() - Number(BigInt(t.started_at) / 1_000_000_000n) < 11 * 60) return
  const r = await agentCall('recover', {}, 150)
  l.warn(`recovered trade ${t.id}`, { tx: r.hash, ok: r.ok })
}
