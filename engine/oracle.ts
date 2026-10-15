import { eq } from 'drizzle-orm'
import type { Hex } from 'viem'
import type { DirectionPayload } from '../lib/calls/payload'
import { chatJson, llmConfigured, models } from '../lib/llm'
import { binanceLastClose } from '../lib/market/binance'
import { loadFrames } from '../lib/market/frames'
import type { Candle, Frames } from '../lib/market/types'
import { getDb, schema } from '../lib/db'
import { HORIZONS, oracleMarket, type Horizon } from '../lib/oracle'
import { publishCall } from './calls'
import { errMsg, log } from './log'
import { atr, ema, mfi, bullishDivergence } from './stquant/indicators.js'
import { mfiExtreme } from './stquant/sniper.js'
import { patternSupport, patternTargets } from './stquant/structure.js'

const l = log('oracle')

type Vote = { model: string; direction: 'up' | 'down'; confidence: number; why: string }

const pct = (a: number, b: number) => ((a - b) / b) * 100
const round = (n: number, d = 2) => Number(n.toFixed(d))

function ret(candles: Candle[], bars: number) {
  const last = candles.at(-1)!.c
  const then = candles.at(-1 - bars)?.c
  return then ? round(pct(last, then)) : null
}

/** The facts every model sees. All of it is computed from public Binance candles. */
export function features(symbol: string, f: Frames, btc?: Frames) {
  const price = f.m15.at(-1)!.c
  const e20h1 = ema(f.h1, 20)
  const e50h1 = ema(f.h1, 50)
  const e20h4 = ema(f.h4, 20)
  const e50h4 = ema(f.h4, 50)
  const x15 = mfiExtreme(f.m15)
  const x1h = mfiExtreme(f.h1)
  const support = patternSupport(f, price)
  const targets = patternTargets(f, price)
  const div = bullishDivergence(f.h1)
  const vol24 = f.h1.slice(-24).reduce((s, k) => s + k.v * k.c, 0)
  const volPrior = f.h1.slice(-24 * 8, -24).reduce((s, k) => s + k.v * k.c, 0) / 7
  return {
    asset: symbol,
    price,
    returnsPct: { '1h': ret(f.h1, 1), '4h': ret(f.h1, 4), '24h': ret(f.h1, 24), '7d': ret(f.h4, 42) },
    trend: {
      '1h': e20h1 && e50h1 ? (e20h1 > e50h1 ? 'EMA20 above EMA50' : 'EMA20 below EMA50') : null,
      '4h': e20h4 && e50h4 ? (e20h4 > e50h4 ? 'EMA20 above EMA50' : 'EMA20 below EMA50') : null,
      priceVsEma50_4hPct: e50h4 ? round(pct(price, e50h4)) : null,
    },
    mfi: {
      '15m': x15 ? { value: round(x15.value, 1), percentileOfLast100: round(x15.percentile, 2), turningUp: x15.turningUp } : null,
      '1h': x1h ? { value: round(x1h.value, 1), percentileOfLast100: round(x1h.percentile, 2), turningUp: x1h.turningUp } : null,
      '4h': round(mfi(f.h4)?.at(-1) ?? 50, 1),
    },
    atr1hPct: round(((atr(f.h1) ?? 0) / price) * 100),
    structure: {
      support: support ? { price: support.price, distPct: round(support.distPct * 100), kind: `${support.tf} ${support.kind}`, confirmations: support.confirms } : null,
      firstResistance: targets?.r1 ? { price: targets.r1.price, distPct: round(pct(targets.r1.price, price)), kind: `${targets.r1.tf} ${targets.r1.kind}` } : null,
    },
    bullishDivergence1h: Boolean(div?.diverging),
    volume24hVsWeekAvg: volPrior > 0 ? round(vol24 / volPrior) : null,
    btc: btc && symbol !== 'BTC' ? { '4h': ret(btc.h1, 4), '24h': ret(btc.h1, 24) } : undefined,
  }
}

type Features = ReturnType<typeof features>

/**
 * The deterministic voter: short-term momentum against stretch. It always votes, so every call has
 * at least one reproducible opinion behind it, and it breaks ties between language models.
 */
export function quantVote(x: Features, horizon: Horizon): Vote {
  const r = horizon === '1h' ? x.returnsPct['1h'] ?? 0 : horizon === '4h' ? x.returnsPct['4h'] ?? 0 : x.returnsPct['24h'] ?? 0
  let score = Math.sign(r) * Math.min(Math.abs(r) / Math.max(x.atr1hPct, 0.1), 2)
  if (x.trend['4h']?.startsWith('EMA20 above')) score += 0.5
  if (x.trend['4h']?.startsWith('EMA20 below')) score -= 0.5
  const m = x.mfi['1h']?.value ?? 50
  if (m > 80) score -= 1
  if (m < 20) score += 1
  if (x.bullishDivergence1h) score += 0.5
  const direction = score >= 0 ? 'up' : 'down'
  const confidence = Math.round(50 + Math.min(Math.abs(score), 2.5) * 8)
  return {
    model: 'presage-quant-v1',
    direction,
    confidence,
    why: `Momentum ${r >= 0 ? '+' : ''}${r}% over the horizon, 4H ${x.trend['4h'] ?? 'trend unclear'}, 1H MFI ${m}.`,
  }
}

const SYSTEM = `You are one of several independent forecasters behind Presage's Market Oracle.
Every call you make is sealed on chain before the outcome and scored in public afterwards, wins and losses alike.
You get facts computed from public Binance candles. Decide whether the price will be higher or lower at the end of the horizon.
Rules:
- Answer "up" or "down". There is no neutral; if it is close, pick the likelier side and lower your confidence.
- confidence is your probability (50 to 90) that you are right. Be calibrated: most honest calls sit between 52 and 65.
- why: two short sentences in plain English that name the specific facts you used. No hype, no advice, no promises.
Reply with JSON only: {"direction":"up"|"down","confidence":number,"why":string}`

async function llmVote(model: string, x: Features, horizon: Horizon): Promise<Vote> {
  const v = await chatJson<{ direction: string; confidence: number; why: string }>({
    model,
    temperature: 0.2,
    maxTokens: 400,
    // A voter slower than this is skipped, so one slow model can't hold up a paid answer.
    timeoutMs: 25_000,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Horizon: ${horizon}.\nFacts:\n${JSON.stringify(x, null, 1)}` },
    ],
  })
  const direction = String(v.direction).toLowerCase() === 'down' ? 'down' : 'up'
  const confidence = Math.max(50, Math.min(90, Math.round(Number(v.confidence) || 50)))
  return { model, direction, confidence, why: String(v.why ?? '').slice(0, 400) }
}

/** Ask every voter, then take the majority. Confidence is the majority's average, scaled by agreement. */
export async function forecast(symbol: string, horizon: Horizon) {
  const market = oracleMarket(symbol)
  if (!market) throw new Error(`No Binance market for ${symbol}`)
  const [f, btc, last] = await Promise.all([
    loadFrames({ symbol, source: 'binance', market }),
    symbol === 'BTC' ? undefined : loadFrames({ symbol: 'BTC', source: 'binance', market: 'BTCUSDT' }),
    binanceLastClose(market),
  ])
  if (f.m15.length < 100 || f.h1.length < 100) throw new Error(`Not enough price history for ${symbol}`)
  const x = features(symbol, f, btc)

  const votes: Vote[] = [quantVote(x, horizon)]
  if (llmConfigured()) {
    const results = await Promise.allSettled(models.oracle().map(m => llmVote(m, x, horizon)))
    for (const r of results) {
      if (r.status === 'fulfilled') votes.push(r.value)
      else l.warn(`a model did not answer: ${errMsg(r.reason)}`)
    }
  }
  const up = votes.filter(v => v.direction === 'up')
  const down = votes.filter(v => v.direction === 'down')
  const side = up.length === down.length ? votes[0].direction : up.length > down.length ? 'up' : 'down'
  const majority = side === 'up' ? up : down
  const agreement = majority.length / votes.length
  const confidence = Math.round(50 + (majority.reduce((s, v) => s + v.confidence, 0) / majority.length - 50) * agreement)
  const lead = majority.find(v => v.model !== 'presage-quant-v1') ?? majority[0]
  return {
    market,
    price: last.price,
    priceMinute: last.minute,
    direction: side as 'up' | 'down',
    confidence,
    why: `${majority.length} of ${votes.length} models say ${side}. ${lead.why}`.trim(),
    votes,
    features: x,
  }
}

/** Answer paid Oracle requests: forecast, seal against the payment, record it. */
export async function answerPaid(oracleAgentId: number): Promise<void> {
  const db = getDb()
  const paid = await db.select().from(schema.oracleRequests).where(eq(schema.oracleRequests.status, 'paid'))
  for (const req of paid) {
    await db.update(schema.oracleRequests).set({ status: 'answering' }).where(eq(schema.oracleRequests.requestId, req.requestId))
    try {
      const horizon = req.horizon as Horizon
      const h = HORIZONS[horizon]
      const fc = await forecast(req.asset, horizon)
      const issuedAt = Math.floor(Date.now() / 1000)
      const payload: DirectionPayload = {
        v: 1,
        rules: 'presage/direction-v1',
        agent: oracleAgentId,
        asset: { symbol: req.asset, source: 'binance', market: fc.market },
        direction: fc.direction,
        confidence: fc.confidence,
        horizonSec: h.seconds,
        issuedAt,
        priceAtIssue: fc.price,
        flatBandBps: h.flatBandBps,
        why: fc.why,
        models: fc.votes.map(v => ({ model: v.model, direction: v.direction, confidence: v.confidence })),
        request: req.requestId as Hex,
      }
      const row = await publishCall({ payload, revealBy: issuedAt + h.seconds + h.graceSec, requestId: req.requestId as Hex })
      await db
        .update(schema.oracleRequests)
        .set({ status: 'sealed', callId: row.id, sealedAt: row.sealedAt })
        .where(eq(schema.oracleRequests.requestId, req.requestId))
      l.info(`answered ${req.asset} ${horizon}: ${fc.direction} ${fc.confidence}%`, { call: row.id })
    } catch (e) {
      l.error(`could not answer ${req.requestId.slice(0, 10)}: ${errMsg(e)}`)
      await db
        .update(schema.oracleRequests)
        .set({ status: 'failed', error: errMsg(e) })
        .where(eq(schema.oracleRequests.requestId, req.requestId))
    }
  }
}
