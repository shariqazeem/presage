import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, gt, inArray } from 'drizzle-orm'
import type { SetupPayload } from '../lib/calls/payload'
import { getDb, schema } from '../lib/db'
import { chatJson, llmConfigured, models } from '../lib/llm'
import { loadFrames } from '../lib/market/frames'
import { topPools, trendingPools, type Pool } from '../lib/market/geckoterminal'
import type { AssetRef, Frames } from '../lib/market/types'
import { publishCall } from './calls'
import { errMsg, log } from './log'
import { armPlan, firstRejection, nearestRejector } from './stquant/arming.js'
import { renderChart } from './stquant/charts.js'
import { SIGNAL } from './stquant/settings.js'
import { sniperSignal } from './stquant/sniper.js'

const l = log('stquant')

type GtAsset = Extract<AssetRef, { source: 'geckoterminal' }> & { liquidityUsd: number; volume24hUsd: number }

// ST Quant's own universe filters (okxtradingagent/src/universe.js), applied to GeckoTerminal pools.
const FILTERS = { minLiquidityUsd: 120_000, minVolume24hUsd: 200_000, minTurnover: 0.08 }
const MAX_UNIVERSE = Number(process.env.STQUANT_MAX_UNIVERSE ?? 24)
const NETWORKS = (process.env.STQUANT_NETWORKS ?? 'bsc,x-layer').split(',').map(s => s.trim())
const MAX_OPEN = Number(process.env.STQUANT_MAX_OPEN ?? 8)
const AI_READS_PER_SCAN = 2
// Wrapped, pegged, staked or tokenised majors: they track something else. Same list as ST Quant.
const PARKING =
  /^(w?eth|w?btc|cb?btc|tbtc|w?bnb|w?sol|okb|matic|pol|avax|weeth|eeth|steth|wsteth|reth|cbeth|sfrx|frx|xaut|paxg|usd|usdt|usdc|dai|fdusd|tusd|usde|susd|susds|pyusd|aarb|ausdc|a[a-z]*usd)/i
// Tokenised stocks (wNVDAx, wQQQx, ...) track an equity, which by the same logic is not ST Quant's game.
const TOKENISED_STOCK = /^w?[A-Z]{1,5}x$/

const CHART_DIR = resolve(process.env.PRESAGE_CHART_DIR ?? 'var/charts')
const RUBRIC = readFileSync(new URL('./stquant/RUBRIC.md', import.meta.url), 'utf8')

let universe: GtAsset[] = []
let universeAt = 0

async function refreshUniverse(): Promise<void> {
  const pools: Pool[] = []
  for (const net of NETWORKS) {
    for (const fetch of [trendingPools, topPools]) {
      try {
        pools.push(...(await fetch(net)))
      } catch (e) {
        l.warn(`universe feed ${net} failed: ${errMsg(e)}`)
      }
    }
  }
  const best = new Map<string, Pool>()
  for (const p of pools) {
    if (PARKING.test(p.baseSymbol) || TOKENISED_STOCK.test(p.baseSymbol)) continue
    if (p.liquidityUsd < FILTERS.minLiquidityUsd || p.volume24hUsd < FILTERS.minVolume24hUsd) continue
    if (p.volume24hUsd / p.liquidityUsd < FILTERS.minTurnover) continue
    const key = `${p.network}:${p.baseToken.toLowerCase()}`
    const prev = best.get(key)
    if (!prev || p.liquidityUsd > prev.liquidityUsd) best.set(key, p)
  }
  const ranked = [...best.values()].sort((a, b) => b.volume24hUsd / b.liquidityUsd - a.volume24hUsd / a.liquidityUsd)
  if (!ranked.length && universe.length) return // keep the old list rather than go blind
  universe = ranked.slice(0, MAX_UNIVERSE).map(p => ({
    symbol: p.baseSymbol,
    source: 'geckoterminal',
    network: p.network,
    pool: p.pool,
    token: p.baseToken,
    liquidityUsd: p.liquidityUsd,
    volume24hUsd: p.volume24hUsd,
  }))
  universeAt = Date.now()
  l.info(`universe: ${universe.length} pools`, { symbols: universe.map(u => u.symbol).join(' ') })
}

type Candidate = {
  asset: GtAsset
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

function candidateFrom(asset: GtAsset, frames: Frames): Candidate | null {
  const price = frames.m15.at(-1)!.c
  const plan = armPlan(frames, asset)
  if (plan.arm && 'tp1' in plan) {
    return {
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
  }
  const sig = sniperSignal(frames)
  if (!sig.fire || !('stop' in sig)) return null
  // The sniper says price is at support with MFI at an extreme: a market entry now. The target is the
  // rubric's TP1, the first rejection point, else the nearest level that has rejected price.
  const target = firstRejection(frames, price) ?? nearestRejector(frames, price)?.price
  if (!target || !(sig.stop < price)) return null
  const rr = (target - price) / (price - sig.stop)
  if (rr < 1.5 || (target - price) / price < 0.02) return null
  return {
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

type ChartRead = { verdict: 'BUY' | 'WAIT' | 'AVOID'; conviction: number; why: string; wouldChangeMind: string; vetoes: string[] }

/** The AI chart read: the founder's rubric applied to the rendered chart. It approves or vetoes; it never sets prices. */
async function chartRead(c: Candidate, png: Buffer): Promise<ChartRead> {
  const price = c.frames.m15.at(-1)!.c
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
    `Coin: ${c.asset.symbol} on ${c.asset.network}. Last price ${price}.`,
    `Liquidity $${Math.round(c.asset.liquidityUsd / 1000)}k. 24h volume $${Math.round(c.asset.volume24hUsd / 1000)}k.`,
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
  return chatJson<ChartRead>({
    model: models.vision(),
    temperature: 0.1,
    maxTokens: 500,
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
  l.info(`sealed ${c.route} setup ${c.asset.symbol}`, { call: row.id, chainCallId: row.chainCallId, entry: c.entry, stop: c.stop, target: c.target })
}

async function findCandidates(agentId: number | null): Promise<Candidate[]> {
  if (Date.now() - universeAt > 30 * 60_000 || !universe.length) await refreshUniverse()
  const found: Candidate[] = []
  for (const asset of universe) {
    if (agentId != null && (await recentlyCalled(agentId, asset.symbol))) continue
    try {
      const frames = await loadFrames(asset)
      if (frames.m15.length < 120 || frames.h1.length < 60 || frames.d1.length < 7) continue
      const c = candidateFrom(asset, frames)
      if (c) found.push(c)
    } catch (e) {
      l.warn(`${asset.symbol}: ${errMsg(e)}`)
    }
  }
  return found.sort((a, b) => b.score - a.score)
}

/** The same scan without sealing anything: what ST Quant would consider right now. */
export async function previewScan() {
  const found = await findCandidates(null)
  return {
    universe: universe.map(u => `${u.symbol}@${u.network}`),
    candidates: found.map(c => ({ symbol: c.asset.symbol, network: c.asset.network, route: c.route, score: c.score, entry: c.entry, stop: c.stop, target: c.target, conviction: c.conviction, reasons: c.reasons })),
  }
}

/** One pass over the universe: find setups, let the chart read veto the sniper's, seal what survives. */
export async function scanOnce(agentId: number): Promise<void> {
  const room = MAX_OPEN - (await openCount(agentId))
  if (room <= 0) return
  const found = await findCandidates(agentId)

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
      if (!llmConfigured() || !models.vision() || aiReads >= AI_READS_PER_SCAN) continue
      aiReads++
      const read = await chartRead(c, renderChart({ symbol: c.asset.symbol, frames: c.frames }))
      l.info(`chart read ${c.asset.symbol}: ${read.verdict} ${read.conviction}`, { why: read.why })
      if (read.verdict === 'BUY' && read.conviction >= 4) {
        await publish(agentId, { ...c, conviction: read.conviction }, read.why)
        published++
      }
    } catch (e) {
      l.error(`${c.asset.symbol} not published: ${errMsg(e)}`)
    }
  }
  l.info(`scan done: ${universe.length} pools, ${found.length} candidates, ${published} sealed`)
}
