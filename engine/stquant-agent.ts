import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { and, eq, gt, inArray } from 'drizzle-orm'
import type { SetupPayload } from '../lib/calls/payload'
import { getDb, schema } from '../lib/db'
import type { RadarRow, RadarState } from '../lib/floor-types'
import { chatJson, llmConfigured, models } from '../lib/llm'
import { loadFrames } from '../lib/market/frames'
import { GT_POOL_BUDGET, topPools, trendingPools, type Pool } from '../lib/market/geckoterminal'
import type { AssetRef, Frames } from '../lib/market/types'
import { ORACLE_ASSETS } from '../lib/oracle-assets'
import { publishCall } from './calls'
import { emit, setRadar } from './events'
import { errMsg, log } from './log'
import { armPlan, firstRejection, nearestRejector } from './stquant/arming.js'
import { renderChart } from './stquant/charts.js'
import { atr } from './stquant/indicators.js'
import { SIGNAL } from './stquant/settings.js'
import { mfiExtreme, sniperSignal, supportMap } from './stquant/sniper.js'

const l = log('stquant')

type Watched = AssetRef & { liquidityUsd?: number; volume24hUsd?: number }

// ST Quant's own universe filters (okxtradingagent/src/universe.js), applied to GeckoTerminal pools.
const FILTERS = { minLiquidityUsd: 120_000, minVolume24hUsd: 200_000, minTurnover: 0.08 }
const MAX_POOLS = Number(process.env.STQUANT_MAX_UNIVERSE ?? GT_POOL_BUDGET)
const NETWORKS = (process.env.STQUANT_NETWORKS ?? 'bsc,x-layer').split(',').map(s => s.trim())
const MAX_OPEN = Number(process.env.STQUANT_MAX_OPEN ?? 8)
const AI_READS_PER_SCAN = 2
// A chart read costs a few cents of model time; cap them per UTC day so spend stays bounded.
const AI_READS_PER_DAY = Number(process.env.STQUANT_MAX_AI_READS_PER_DAY ?? 60)
let aiDay = ''
let aiToday = 0
// Wrapped, pegged, staked or tokenised majors: they track something else. Same list as ST Quant.
const PARKING =
  /^(w?eth|w?btc|cb?btc|tbtc|w?bnb|w?sol|okb|matic|pol|avax|weeth|eeth|steth|wsteth|reth|cbeth|sfrx|frx|xaut|paxg|usd|usdt|usdc|dai|fdusd|tusd|usde|susd|susds|pyusd|aarb|ausdc|a[a-z]*usd)/i
// Tokenised stocks (wNVDAx, wQQQx, ...) track an equity, which by the same logic is not ST Quant's game.
const TOKENISED_STOCK = /^w?[A-Z]{1,5}x$/
// Bridged or tokenised majors (xETH, xBTC, xSOL, ...) for the same reason.
const TOKENISED_MAJOR = /^x(eth|btc|sol|bnb|xrp|doge)$/i

const CHART_DIR = resolve(process.env.PRESAGE_CHART_DIR ?? 'var/charts')
const RUBRIC = readFileSync(new URL('./stquant/RUBRIC.md', import.meta.url), 'utf8')

/** The Binance side of the universe: every coin the Oracle covers, priced where anyone can check. */
const BINANCE_MARKETS: Watched[] = ORACLE_ASSETS.map(a => ({ symbol: a.symbol, source: 'binance', market: a.market }))

let pools: Watched[] = []
let poolsAt = 0
/** Readings from the last pass over each half of the universe, so the radar always shows the whole picture. */
const radar = new Map<string, RadarRow>()

const refOf = (a: AssetRef) => (a.source === 'binance' ? `binance:${a.market}` : `${a.network}:${a.pool}`)

async function refreshPools(): Promise<void> {
  const found: Pool[] = []
  for (const net of NETWORKS) {
    for (const fetch of [trendingPools, topPools]) {
      try {
        found.push(...(await fetch(net)))
      } catch (e) {
        l.warn(`pool feed ${net} failed: ${errMsg(e)}`)
      }
    }
  }
  const best = new Map<string, Pool>()
  for (const p of found) {
    if (PARKING.test(p.baseSymbol) || TOKENISED_STOCK.test(p.baseSymbol) || TOKENISED_MAJOR.test(p.baseSymbol)) continue
    if (p.liquidityUsd < FILTERS.minLiquidityUsd || p.volume24hUsd < FILTERS.minVolume24hUsd) continue
    if (p.volume24hUsd / p.liquidityUsd < FILTERS.minTurnover) continue
    const key = `${p.network}:${p.baseToken.toLowerCase()}`
    const prev = best.get(key)
    if (!prev || p.liquidityUsd > prev.liquidityUsd) best.set(key, p)
  }
  const ranked = [...best.values()].sort((a, b) => b.volume24hUsd / b.liquidityUsd - a.volume24hUsd / a.liquidityUsd)
  if (!ranked.length && pools.length) return // keep the old list rather than go blind
  pools = ranked.slice(0, MAX_POOLS).map(p => ({
    symbol: p.baseSymbol,
    source: 'geckoterminal',
    network: p.network,
    pool: p.pool,
    token: p.baseToken,
    liquidityUsd: p.liquidityUsd,
    volume24hUsd: p.volume24hUsd,
  }))
  poolsAt = Date.now()
  l.info(`pools: ${pools.length}`, { symbols: pools.map(u => u.symbol).join(' ') })
}

type Candidate = {
  asset: Watched
  frames: Frames
  route: 'armed' | 'sniper'
  score: number
  entry: { type: 'market' | 'limit'; price: number }
  stop: number
  target: number
  conviction: number
  reasons: string[]
}

const fmt = (n: number) => Number(n.toPrecision(8))
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * One market through the whole thesis: where MFI sits in its own range, where the nearest support is,
 * what the sniper and the arming plan say. The radar shows this; a candidate comes out of it when the
 * rules say so.
 */
function read(asset: Watched, frames: Frames): { row: RadarRow; candidate: Candidate | null } {
  const price = frames.m15.at(-1)!.c
  const x15 = mfiExtreme(frames.m15)
  const x1h = mfiExtreme(frames.h1)
  const a = atr(frames.m15)
  const atrPct = a ? (a / price) * 100 : 0

  let support: { price: number; type: string; tf: string } | null = null
  for (const [tf, list] of Object.entries(supportMap(frames))) {
    for (const s of list) {
      const dist = (price - s.price) / price
      if (dist >= -0.01 && (!support || s.price > support.price)) support = { price: s.price, type: s.type, tf }
    }
  }
  const supportDistPct = support ? ((price - support.price) / price) * 100 : null

  const sig = sniperSignal(frames)
  const plan = armPlan(frames, asset)
  const score = 'score' in sig ? sig.score : 0
  const blockers = 'blockers' in plan ? plan.blockers : []

  let candidate: Candidate | null = null
  if (plan.arm && 'tp1' in plan) {
    candidate = {
      asset,
      frames,
      route: 'armed',
      score: 100 + plan.conviction,
      entry: { type: plan.entryType, price: fmt(plan.entryType === 'market' ? price : plan.triggerPrice) },
      stop: fmt(plan.stop),
      target: fmt(plan.tp1),
      conviction: plan.conviction,
      reasons: plan.reasons,
    }
  } else if (sig.fire && 'stop' in sig) {
    // The sniper says price is at support with MFI at an extreme: a market entry now. The target is the
    // rubric's TP1, the first rejection point, else the nearest level that has rejected price.
    const target = firstRejection(frames, price) ?? nearestRejector(frames, price)?.price
    if (target && sig.stop < price) {
      const rr = (target - price) / (price - sig.stop)
      if (rr >= 1.5 && (target - price) / price >= 0.02) {
        candidate = {
          asset,
          frames,
          route: 'sniper',
          score: sig.score,
          entry: { type: 'market', price: fmt(price) },
          stop: fmt(sig.stop),
          target: fmt(target),
          conviction: 'conviction' in plan ? Math.min(5, Math.max(1, plan.conviction)) : 3,
          reasons: [...sig.notes, `${rr.toFixed(1)}R to the first rejection at ${fmt(target)}`],
        }
      }
    }
  }

  const state: RadarState = candidate
    ? 'firing'
    : atrPct < 0.4
      ? 'quiet'
      : score >= 8 || (supportDistPct != null && supportDistPct <= 2.5 && x15 != null && x15.percentile <= 0.2)
        ? 'close'
        : 'watching'

  const row: RadarRow = {
    symbol: asset.symbol,
    source: asset.source,
    ref: refOf(asset),
    price: fmt(price),
    mfi15: x15 ? r1(x15.value) : null,
    mfi15Pct: x15 ? Math.round(x15.percentile * 100) : null,
    mfi1h: x1h ? r1(x1h.value) : null,
    mfi1hPct: x1h ? Math.round(x1h.percentile * 100) : null,
    atrPct: Math.round(atrPct * 100) / 100,
    supportDistPct: supportDistPct == null ? null : Math.round(supportDistPct * 10) / 10,
    supportKind: support ? `${support.tf} ${support.type.replace('trendline-', '')}` : null,
    score,
    state,
    blocker: candidate ? null : (blockers[0] ?? ('reason' in sig && sig.reason ? sig.reason : null)),
    at: Math.floor(Date.now() / 1000),
  }
  return { row, candidate }
}

type ChartRead = { verdict: 'BUY' | 'WAIT' | 'AVOID'; conviction: number; why: string; wouldChangeMind: string; vetoes: string[] }

/** The AI chart read: the founder's rubric applied to the rendered chart. It approves or vetoes; it never sets prices. */
async function chartRead(c: Candidate, png: Buffer): Promise<ChartRead> {
  const price = c.frames.m15.at(-1)!.c
  const where = c.asset.source === 'binance' ? `Binance spot ${c.asset.market}` : `${c.asset.network} DEX pool`
  const liquidity =
    c.asset.liquidityUsd != null && c.asset.volume24hUsd != null
      ? `Liquidity $${Math.round(c.asset.liquidityUsd / 1000)}k. 24h volume $${Math.round(c.asset.volume24hUsd / 1000)}k.`
      : 'A centralised spot market: liquidity and volume are not a concern here.'
  const text = [
    'You are a disciplined crypto chart analyst. Apply the rubric exactly as written.',
    'Do not invent rules, and do not add criteria the rubric does not contain.',
    '',
    'CALIBRATION. Every call you approve is sealed on chain before the outcome and scored in public,',
    'losses included, so a weak approval costs the record and a sound setup passed over is a call the',
    'record never gets. Grade the setup in front of you against the rubric.',
    '',
    'Conviction scale: 5 = every rubric condition present; 4 = the setup is there with one soft',
    'condition missing; 3 = right idea, wrong moment; 2 = resembles the setup but is structurally',
    'wrong; 1 = the inverse of the method.',
    '',
    '=== RUBRIC ===',
    RUBRIC,
    '=== END RUBRIC ===',
    '',
    `Coin: ${c.asset.symbol} (${where}). Last price ${price}.`,
    liquidity,
    `The deterministic plan you are grading: ${c.entry.type} entry ${c.entry.price}, stop ${c.stop}, target ${c.target}.`,
    `What the rules engine saw: ${c.reasons.slice(0, 8).join(' | ')}`,
    '',
    'The image has four panels (1D, 4H, 1H, 15m), each with MFI below. Dashed green is detected',
    'support with its touch count, dashed red is resistance, blue dotted is the last price.',
    'Work top-down, apply a hard veto only if one genuinely fires, then grade.',
    '',
    'Reply with JSON only: {"verdict":"BUY"|"WAIT"|"AVOID","conviction":1-5,"why":"one or two sentences",' +
      '"wouldChangeMind":"what would invalidate this","vetoes":["any hard veto that fired"]}',
  ].join('\n')
  let lastErr: unknown
  for (const model of models.visionChain()) {
    try {
      return await chatJson<ChartRead>({
        model,
        temperature: 0.1,
        maxTokens: 600,
        timeoutMs: 90_000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
            ],
          },
        ],
      })
    } catch (e) {
      lastErr = e
      l.warn(`chart read on ${model} failed, trying the next reader: ${errMsg(e)}`)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No chart reader answered')
}

async function recentlyCalled(agentId: number, symbol: string): Promise<boolean> {
  const since = Math.floor(Date.now() / 1000) - SIGNAL.cooldownSec
  const hit = await getDb()
    .select({ id: schema.calls.id })
    .from(schema.calls)
    .where(and(eq(schema.calls.agentId, agentId), eq(schema.calls.asset, symbol), gt(schema.calls.issuedAt, since)))
    .limit(1)
  return hit.length > 0
}

async function openCount(agentId: number): Promise<number> {
  const rows = await getDb()
    .select({ id: schema.calls.id })
    .from(schema.calls)
    .where(and(eq(schema.calls.agentId, agentId), inArray(schema.calls.status, ['pending', 'sealed'])))
  return rows.length
}

async function publish(agentId: number, c: Candidate, aiWhy?: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const market = c.entry.type === 'market'
  const fillBy = market ? now : now + SIGNAL.fillWindowSec
  const { liquidityUsd: _l, volume24hUsd: _v, ...asset } = c.asset
  const payload: SetupPayload = {
    v: 1,
    rules: 'presage/setup-v1',
    agent: agentId,
    asset,
    side: 'long',
    entry: c.entry,
    stop: c.stop,
    target: c.target,
    conviction: c.conviction,
    issuedAt: now,
    priceAtIssue: fmt(c.frames.m15.at(-1)!.c),
    fillBy,
    maxHoldSec: SIGNAL.maxHoldSec,
    why: [...(aiWhy ? [`Chart read: ${aiWhy}`] : []), ...c.reasons].slice(0, 8).map(r => r.slice(0, 220)),
  }
  const revealBy = fillBy + SIGNAL.maxHoldSec + SIGNAL.revealGraceSec
  const row = await publishCall({ payload, revealBy })
  mkdirSync(CHART_DIR, { recursive: true })
  writeFileSync(`${CHART_DIR}/call-${row.id}.png`, renderChart({ symbol: c.asset.symbol, frames: c.frames }))
  emit(agentId, 'sealed', { callId: row.id, chainCallId: row.chainCallId, symbol: c.asset.symbol, kind: 'setup', route: c.route })
  l.info(`sealed ${c.route} setup ${c.asset.symbol}`, { call: row.id, chainCallId: row.chainCallId, entry: c.entry, stop: c.stop, target: c.target })
}

/** Run `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

/** Read every market in one half of the universe, updating the radar as each one comes in. */
async function pass(agentId: number | null, assets: Watched[], concurrency: number): Promise<Candidate[]> {
  const found: Candidate[] = []
  await pool(assets, concurrency, async asset => {
    try {
      const frames = await loadFrames(asset)
      if (frames.m15.length < 120 || frames.h1.length < 60 || frames.d1.length < 7) return
      const { row, candidate } = read(asset, frames)
      radar.set(row.ref, row)
      if (agentId != null) setRadar(agentId, [...radar.values()])
      if (candidate && (agentId == null || !(await recentlyCalled(agentId, asset.symbol)))) found.push(candidate)
    } catch (e) {
      l.warn(`${asset.symbol}: ${errMsg(e)}`)
    }
  })
  return found
}

async function findCandidates(agentId: number | null): Promise<Candidate[]> {
  if (Date.now() - poolsAt > 30 * 60_000 || !pools.length) await refreshPools()
  // Drop pools that left the universe, so the radar never shows a stale market.
  const live = new Set([...BINANCE_MARKETS, ...pools].map(refOf))
  for (const key of radar.keys()) if (!live.has(key)) radar.delete(key)
  const found = [...(await pass(agentId, BINANCE_MARKETS, 4)), ...(await pass(agentId, pools, 1))]
  return found.sort((a, b) => b.score - a.score)
}

/** The same scan without sealing anything: what ST Quant would consider right now. */
export async function previewScan() {
  const found = await findCandidates(null)
  return {
    universe: [...BINANCE_MARKETS, ...pools].map(u => refOf(u)),
    radar: [...radar.values()].sort((a, b) => b.score - a.score),
    candidates: found.map(c => ({ symbol: c.asset.symbol, ref: refOf(c.asset), route: c.route, score: c.score, entry: c.entry, stop: c.stop, target: c.target, conviction: c.conviction, reasons: c.reasons })),
  }
}

let scanning = false

/** One pass over the universe: find setups, let the chart read veto the sniper's, seal what survives. */
export async function scanOnce(agentId: number): Promise<void> {
  if (scanning) return // the DEX pass can outlast a candle; never run two scans at once
  scanning = true
  try {
    await scan(agentId)
  } finally {
    scanning = false
  }
}

async function scan(agentId: number): Promise<void> {
  const started = Date.now()
  const room = MAX_OPEN - (await openCount(agentId))
  const markets = BINANCE_MARKETS.length + (pools.length || MAX_POOLS)
  emit(agentId, 'scan', { phase: 'start', markets })
  const found = await findCandidates(agentId)
  for (const c of found) emit(agentId, 'candidate', { symbol: c.asset.symbol, route: c.route, score: c.score })

  let published = 0
  let aiReads = 0
  for (const c of found) {
    if (published >= room) break
    try {
      if (c.route === 'armed') {
        await publish(agentId, c)
        published++
        continue
      }
      // Sniper fires need the chart read's approval; without a model only armed plans go out.
      const today = new Date().toISOString().slice(0, 10)
      if (today !== aiDay) {
        aiDay = today
        aiToday = 0
      }
      if (!llmConfigured() || !models.vision() || aiReads >= AI_READS_PER_SCAN || aiToday >= AI_READS_PER_DAY) {
        emit(agentId, 'skipped', { symbol: c.asset.symbol, why: 'no chart read available right now' })
        continue
      }
      aiReads++
      aiToday++
      const png = renderChart({ symbol: c.asset.symbol, frames: c.frames })
      const read = await chartRead(c, png)
      // The chart the model looked at is kept so the floor can show it with the verdict.
      mkdirSync(CHART_DIR, { recursive: true })
      const file = `read-${randomBytes(6).toString('hex')}.png`
      writeFileSync(`${CHART_DIR}/${file}`, png)
      emit(agentId, 'chart_read', { symbol: c.asset.symbol, verdict: read.verdict, conviction: read.conviction, why: read.why, vetoes: read.vetoes ?? [], chart: file })
      l.info(`chart read ${c.asset.symbol}: ${read.verdict} ${read.conviction}`, { why: read.why })
      if (read.verdict === 'BUY' && read.conviction >= 4) {
        await publish(agentId, { ...c, conviction: read.conviction }, read.why)
        published++
      }
    } catch (e) {
      // The floor should show a setup that was dropped, not just the log.
      emit(agentId, 'skipped', { symbol: c.asset.symbol, why: `could not finish: ${errMsg(e).slice(0, 120)}` })
      l.error(`${c.asset.symbol} not published: ${errMsg(e)}`)
    }
  }
  emit(agentId, 'scan', { phase: 'done', markets: radar.size, candidates: found.length, sealed: published, ms: Date.now() - started })
  l.info(`scan done: ${radar.size} markets, ${found.length} candidates, ${published} sealed, ${Math.round((Date.now() - started) / 1000)}s`)
}
