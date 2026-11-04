/**
 * History test (backtest) of ST Quant's entry and exit rules on Binance spot candles.
 *
 *   npx tsx scripts/near/backtest.ts --cache <dir> [--markets NEARUSDT,ZECUSDT,BTCUSDT,ETHUSDT,SOLUSDT]
 *     [--days 365] [--history 540] [--end 2026-11-05] [--is-months 8] [--jobs 5] [--validate 25] [--fresh]
 *
 * 1. Candles: 15m for the last `--history` days (1000 per request) and 1d for a long daily history,
 *    cached as JSON in `--cache`.
 * 2. Frames with no lookahead: at every 15m close of the last `--days` days the rules see what the live
 *    agent would see then: the last 500 15m candles, and for 1h/4h/1d the closed candles plus the forming
 *    one built from the 15m candles of the current bucket.
 * 3. Rule calls (armPlan, sniperSignal, patternTargets, v2Read) are expensive, so a pre-filter skips
 *    every step where no rule can fire. It is lossless: armPlan cannot arm unless (15m MFI <= 25 and in
 *    its bottom 40%) or (1h MFI <= 25 and in its bottom 15%), and the sniper cannot fire unless 15m MFI
 *    is in its bottom 12%. The worker checks that on a random sample, and checks the v1 replica against
 *    brain.ts readFrames. Rule outputs are cached per market, keyed by a hash of the rule code.
 * 4. Simulation: fills on later 15m candles (market: next open; limit: a low at or under the trigger
 *    within 24h), stop and target intrabar (both in one candle = stop), 0.3% fee + 0.1% slippage per side,
 *    one position per market, 3h cooldown after an exit.
 *    - v1      the live NEAR brain: market-only armPlan/sniper setups, brain.ts exits, 120h limit
 *    - v1-pub  v1 as published on Metis: armPlan market AND limit entries, its stop/tp1, 48h limit
 *    - v2      engine/near/strategy.ts over a grid; months 1-8 pick it, months 9-12 are out of sample
 */
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exitReason, readFrames } from '../../engine/near/brain'
import { v2Decide, v2Read, type V2Params, type V2Read } from '../../engine/near/strategy'
import { armPlan, firstRejection, nearestRejector } from '../../engine/stquant/arming.js'
import { mfi } from '../../engine/stquant/indicators.js'
import { SIGNAL } from '../../engine/stquant/settings.js'
import { sniperSignal } from '../../engine/stquant/sniper.js'
import { patternTargets } from '../../engine/stquant/structure.js'
import { binanceKlines } from '../../lib/market/binance'
import { aggregate } from '../../lib/market/frames'
import type { Candle, Frames } from '../../lib/market/types'
import type { Coin } from '../../lib/near/config'

// ---------- constants ----------

const M15 = 900_000
const H1 = 3_600_000
const H4 = 14_400_000
const D1 = 86_400_000
const BARS = 500
const FEE = 0.003
const SLIP = 0.001
const COOLDOWN_MS = SIGNAL.cooldownSec * 1000 // 3h
const LIVE_MAX_HOLD_H = 120 // engine/near/desk.ts MAX_HOLD_SEC
const PUB_MAX_HOLD_H = SIGNAL.maxHoldSec / 3600 // 48h
const PUB_FILL_MS = SIGNAL.fillWindowSec * 1000 // 24h
/** Bump when the signal pass changes in a way the code hash cannot see. */
const SIGNALS_VERSION = 1

/** The grid v2 is chosen from. Everything not listed stays at BASE. */
const BASE: V2Params = {
  regimeFilter: true,
  bandAbovePct: 0.005,
  bandBelowPct: 0.003,
  stopAtrMult: 0.6,
  stopMinPct: 0.006,
  minStopDistPct: 0.008,
  maxStopPct: 0.04,
  minRR: 2,
  breakeven: true,
  breakevenLockPct: 0.008,
  maxHoldHours: 72,
  minConviction: 3,
  planVetoes: 'level',
}
const GRID = {
  maxStopPct: [0.03, 0.04, 0.05],
  minRR: [1.5, 2, 2.5],
  maxHoldHours: [48, 72, 120],
  breakeven: [true, false],
  regimeFilter: [true, false],
  planVetoes: ['level', 'all'] as V2Params['planVetoes'][],
}

// ---------- options ----------

type Opts = {
  markets: string[]
  days: number
  history: number
  endMs: number
  isMonths: number
  cache: string
  jobs: number
  validate: number
  fresh: boolean
  worker: string | null
  /** Set by the main process for its workers, so both name the cache file the same way. */
  hash: string | null
}

function parseOpts(): Opts {
  const a = process.argv.slice(2)
  const get = (name: string) => {
    const i = a.indexOf(`--${name}`)
    return i >= 0 ? a[i + 1] : undefined
  }
  const end = get('end')
  let endMs: number
  if (end == null) endMs = Math.floor(Date.now() / M15) * M15
  else if (/^\d+$/.test(end)) endMs = Number(end)
  else endMs = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(endMs)) throw new Error(`bad --end ${end}`)
  const markets = (get('markets') ?? 'NEARUSDT,ZECUSDT,BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  return {
    markets,
    days: Number(get('days') ?? 365),
    history: Number(get('history') ?? 540),
    endMs,
    isMonths: Number(get('is-months') ?? 8),
    cache: resolve(get('cache') ?? process.env.BT_CACHE_DIR ?? join(tmpdir(), 'stquant-backtest')),
    jobs: Number(get('jobs') ?? Math.max(1, Math.min(markets.length, cpus().length - 1))),
    validate: Number(get('validate') ?? 25),
    fresh: a.includes('--fresh'),
    worker: get('worker') ?? null,
    hash: get('hash') ?? null,
  }
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const sig = (n: number) => Number(n.toPrecision(6))
const fmt8 = (n: number) => Number(n.toPrecision(8))

// ---------- candles ----------

type Row = [number, number, number, number, number, number]
const toRows = (ks: Candle[]): Row[] => ks.map(k => [k.ts, k.o, k.h, k.l, k.c, k.v])
const fromRows = (rs: Row[]): Candle[] => rs.map(r => ({ ts: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }))

async function klines(market: string, interval: '15m' | '1d', opts: { limit: number; startMs?: number; endMs?: number }): Promise<Candle[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await binanceKlines(market, interval, opts)
    } catch (e) {
      if (attempt >= 4) throw e
      await sleep(1000 * 2 ** attempt)
    }
  }
}

async function fetchRange(market: string, a: number, b: number): Promise<Candle[]> {
  const out: Candle[] = []
  let start = a
  while (start < b) {
    const batch = await klines(market, '15m', { startMs: start, endMs: b - 1, limit: 1000 })
    if (!batch.length) break
    for (const k of batch) if (k.ts >= a && k.ts < b) out.push(k)
    const next = batch.at(-1)!.ts + M15
    if (next <= start) break
    start = next
    await sleep(100)
  }
  return out
}

function merge(a: Candle[], b: Candle[]): Candle[] {
  const m = new Map<number, Candle>()
  for (const k of a) m.set(k.ts, k)
  for (const k of b) m.set(k.ts, k)
  return [...m.values()].sort((x, y) => x.ts - y.ts)
}

/** 15m candles in [startMs, endMs), fetching only what the cache lacks. */
async function ensure15m(o: Opts, market: string, startMs: number): Promise<Candle[]> {
  const file = join(o.cache, `${market}-15m.json`)
  let have: Candle[] = existsSync(file) ? fromRows(JSON.parse(readFileSync(file, 'utf8')).rows) : []
  const gaps: [number, number][] = []
  if (!have.length) gaps.push([startMs, o.endMs])
  else {
    if (have[0].ts > startMs) gaps.push([startMs, have[0].ts])
    const lastEnd = have.at(-1)!.ts + M15
    if (lastEnd < o.endMs) gaps.push([lastEnd, o.endMs])
  }
  if (gaps.length) {
    for (const [a, b] of gaps) {
      process.stdout.write(`  ${market}: fetching 15m ${day(a)} -> ${day(b)}\n`)
      have = merge(have, await fetchRange(market, a, b))
    }
    const closed = have.filter(k => k.ts + M15 <= Date.now())
    writeFileSync(file, JSON.stringify({ market, interval: '15m', rows: toRows(closed) }))
  }
  return have.filter(k => k.ts >= startMs && k.ts + M15 <= o.endMs)
}

/** Daily candles up to endMs from Binance's 1d endpoint: a daily history longer than the 15m one. */
async function ensure1d(o: Opts, market: string): Promise<Candle[]> {
  const file = join(o.cache, `${market}-1d.json`)
  if (existsSync(file)) {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    if (j.endMs >= o.endMs) return fromRows(j.rows).filter((k: Candle) => k.ts < o.endMs)
  }
  process.stdout.write(`  ${market}: fetching 1d (1000 days)\n`)
  const rows = await klines(market, '1d', { endMs: o.endMs - 1, limit: 1000 })
  writeFileSync(file, JSON.stringify({ market, interval: '1d', endMs: o.endMs, rows: toRows(rows) }))
  return rows.filter(k => k.ts < o.endMs)
}

// ---------- series: everything precomputed once per market ----------

type Series = {
  market: string
  m15: Candle[]
  h1: Candle[]
  h4: Candle[]
  d1: Candle[]
  /** Index of the bucket holding m15[i]; the closed candles are those before it. */
  b1: Int32Array
  b4: Int32Array
  bd: Int32Array
  /** The forming candle of that bucket, built from 15m candles up to and including m15[i]. */
  p1: Candle[]
  p4: Candle[]
  pd: Candle[]
  mfi15: Float64Array
  pct15: Float64Array
  /** 1h MFI with the forming 1h candle last, as armPlan sees it, and its percentile in the last 100. */
  mfi1h: Float64Array
  pct1h: Float64Array
  /** Daily EMA50 downtrend (v2's regime) by closed-day index. */
  dayDown: Uint8Array
  dailyCheck: { days: number; maxCloseDiff: number; maxVolDiff: number }
}

function partials(m15: Candle[], tf: number): Candle[] {
  const out: Candle[] = new Array(m15.length)
  let cur: Candle | null = null
  for (let i = 0; i < m15.length; i++) {
    const k = m15[i]
    const b = Math.floor(k.ts / tf) * tf
    cur = cur && cur.ts === b ? { ts: b, o: cur.o, h: Math.max(cur.h, k.h), l: Math.min(cur.l, k.l), c: k.c, v: cur.v + k.v } : { ts: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }
    out[i] = cur
  }
  return out
}

function bucketIndex(m15: Candle[], agg: Candle[], tf: number): Int32Array {
  const out = new Int32Array(m15.length).fill(-1)
  let j = 0
  for (let i = 0; i < m15.length; i++) {
    const b = Math.floor(m15[i].ts / tf) * tf
    while (j < agg.length && agg[j].ts < b) j++
    out[i] = j // agg[j].ts === b when present; either way agg[0..j-1] are the closed ones
  }
  return out
}

function percentiles(series: ArrayLike<number>, i: number, cur: number, n = 100): number {
  let below = 0
  for (let j = i - n + 1; j <= i; j++) if (series[j] < cur) below++
  return Number((below / n).toFixed(3))
}

function buildSeries(market: string, m15: Candle[], d1: Candle[]): Series {
  const h1 = aggregate(m15, H1)
  const h4 = aggregate(m15, H4)
  const N = m15.length
  const p1 = partials(m15, H1)
  const p4 = partials(m15, H4)
  const pd = partials(m15, D1)
  const b1 = bucketIndex(m15, h1, H1)
  const b4 = bucketIndex(m15, h4, H4)
  const bd = bucketIndex(m15, d1, D1)

  const m = mfi(m15) ?? []
  const mfi15 = Float64Array.from(m, v => (v == null ? NaN : v))
  const pct15 = new Float64Array(N).fill(NaN)
  for (let i = 14 + 99; i < N; i++) pct15[i] = percentiles(mfi15, i, mfi15[i])

  const mh = mfi(h1) ?? []
  const mfiH1 = Float64Array.from(mh, v => (v == null ? NaN : v))
  const mfi1h = new Float64Array(N).fill(NaN)
  const pct1h = new Float64Array(N).fill(NaN)
  for (let i = 0; i < N; i++) {
    const b = b1[i]
    if (b < 14 + 99) continue
    const win = h1.slice(b - 14, b)
    win.push(p1[i])
    const cur = mfi(win)!.at(-1)!
    mfi1h[i] = cur
    let below = 0
    for (let j = b - 99; j < b; j++) if (mfiH1[j] < cur) below++
    pct1h[i] = Number((below / 100).toFixed(3))
  }

  // v2's regime by closed day: close under EMA50 and EMA50 under its value 5 days earlier.
  const dayDown = new Uint8Array(d1.length)
  const e: number[] = []
  const k = 2 / 51
  for (let j = 0; j < d1.length; j++) {
    if (j < 49) e.push(NaN)
    else if (j === 49) e.push(d1.slice(0, 50).reduce((s, c) => s + c.c, 0) / 50)
    else e.push(d1[j].c * k + e[j - 1] * (1 - k))
    if (j >= 54) dayDown[j] = d1[j].c < e[j] && e[j] < e[j - 5] ? 1 : 0
  }

  // Binance's 1d candles must match the 15m candles they summarise.
  const agg = aggregate(m15, D1)
  const byTs = new Map(d1.map(c => [c.ts, c]))
  let days = 0, maxCloseDiff = 0, maxVolDiff = 0
  for (const a of agg.slice(1, -1)) {
    const b = byTs.get(a.ts)
    if (!b) continue
    days++
    maxCloseDiff = Math.max(maxCloseDiff, Math.abs(a.c - b.c) / b.c)
    maxVolDiff = Math.max(maxVolDiff, Math.abs(a.v - b.v) / Math.max(b.v, 1e-12))
  }
  return { market, m15, h1, h4, d1, b1, b4, bd, p1, p4, pd, mfi15, pct15, mfi1h, pct1h, dayDown, dailyCheck: { days, maxCloseDiff, maxVolDiff } }
}

/** What the live agent would load at the close of m15[i]: 500 bars a timeframe, forming candle last. */
function framesAt(s: Series, i: number): Frames {
  const m15 = s.m15.slice(Math.max(0, i - (BARS - 1)), i + 1)
  const tail = (agg: Candle[], b: number, p: Candle) => {
    const out = agg.slice(Math.max(0, b - (BARS - 1)), b)
    out.push(p)
    return out
  }
  return { m15, h1: tail(s.h1, s.b1[i], s.p1[i]), h4: tail(s.h4, s.b4[i], s.p4[i]), d1: tail(s.d1, s.bd[i], s.pd[i]) }
}

function regimeDownAt(s: Series, i: number): boolean {
  const j = s.bd[i] - 1
  return j >= 0 && s.dayDown[j] === 1
}

type Window = { startMs: number; splitMs: number; endMs: number; from: number; split: number; to: number }

function windowOf(o: Opts, s: Series): Window {
  const startMs = Math.floor((o.endMs - o.days * D1) / M15) * M15
  const d = new Date(startMs)
  const splitMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + o.isMonths, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
  const from = s.m15.findIndex(k => k.ts >= startMs)
  let split = s.m15.findIndex(k => k.ts >= splitMs)
  if (split < 0) split = s.m15.length
  const to = s.m15.length - 1
  if (from < 0 || s.b4[from] < BARS - 1) throw new Error(`${s.market}: not enough history before ${day(startMs)}`)
  return { startMs, splitMs, endMs: o.endMs, from, split, to }
}

async function loadSeries(o: Opts, market: string): Promise<Series> {
  const histStart = Math.floor((o.endMs - o.history * D1) / D1) * D1
  const m15 = await ensure15m(o, market, histStart)
  const d1 = await ensure1d(o, market)
  return buildSeries(market, m15, d1)
}

// ---------- the signal pass (expensive, cached) ----------

type LiveRec = { route: 'armed' | 'sniper'; stop: number; target: number; r1: number | null; conviction: number; rr: number; reasons: string[]; level: number | null }
type PubRec = { type: 'market' | 'limit'; entry: number; stop: number; target: number; conviction: number; rr: number; reasons: string[] }
type Diag = { level: number; tf: string; type: string; dist: number; strength: number; confluence: number; m15: number; m1h: number }
type StepRec = { i: number; ts: number; price: number; live?: LiveRec; pub?: PubRec; v2?: V2Read; diag?: Diag }
type SignalFile = {
  market: string
  hash: string
  window: Window
  stats: Record<string, number>
  v2Blockers: Record<string, number>
  validation: { liveChecked: number; liveMismatches: string[]; prefilterChecked: number; prefilterLeaks: string[] }
  dailyCheck: Series['dailyCheck']
  recs: StepRec[]
}

function codeHash(): string {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const h = createHash('sha256').update(String(SIGNALS_VERSION))
  for (const f of ['engine/stquant/arming.js', 'engine/stquant/sniper.js', 'engine/stquant/structure.js', 'engine/stquant/indicators.js', 'engine/stquant/settings.js', 'engine/near/brain.ts']) {
    h.update(readFileSync(join(root, f)))
  }
  // V2_DEFAULTS does not change what is read, only which reads become trades.
  h.update(readFileSync(join(root, 'engine/near/strategy.ts'), 'utf8').replace(/export const V2_DEFAULTS[\s\S]*?\n}\n/, ''))
  return h.digest('hex').slice(0, 10)
}

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace(/[-:T]/g, '')
const signalsPath = (o: Opts, market: string, hash: string) => join(o.cache, `signals-${market}-${stamp(o.endMs)}-${o.days}d-${o.history}hist-${hash}.json`)

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The live NEAR brain's decision (engine/near/brain.ts readFrames), from the same rule outputs. */
function liveSetup(
  frames: Frames,
  price: number,
  plan: ReturnType<typeof armPlan> | null,
  sniper: ReturnType<typeof sniperSignal> | null,
  targetsOf: () => ReturnType<typeof patternTargets>,
): LiveRec | null {
  if (plan && plan.arm && 'tp1' in plan) {
    if (plan.entryType !== 'market') return null
    const targets = targetsOf()
    const target = targets.r2?.price ?? plan.tp1
    return {
      route: 'armed',
      stop: sig(plan.stop),
      target: sig(Math.max(target, plan.tp1)),
      r1: targets.r1 && targets.r1.price < target ? sig(targets.r1.price) : null,
      conviction: plan.conviction,
      rr: plan.rr,
      reasons: plan.reasons,
      level: plan.level.price,
    }
  }
  if (sniper && sniper.fire && 'stop' in sniper) {
    const targets = targetsOf()
    const target = targets.r2?.price ?? firstRejection(frames, price) ?? nearestRejector(frames, price)?.price
    if (target && sniper.stop < price) {
      const rr = (target - price) / (price - sniper.stop)
      if (rr >= 1.5 && (target - price) / price >= 0.02) {
        return {
          route: 'sniper',
          stop: sig(sniper.stop),
          target: sig(target),
          r1: targets.r1 && targets.r1.price < target ? sig(targets.r1.price) : null,
          conviction: plan && 'conviction' in plan ? Math.min(5, Math.max(1, plan.conviction)) : 3,
          rr,
          reasons: [...sniper.notes, `${rr.toFixed(1)}R to ${target.toPrecision(5)}`],
          // sniperSignal leaves its supports sorted nearest (highest) first.
          level: sniper.supports[0]?.price ?? null,
        }
      }
    }
  }
  return null
}

function gates(s: Series, i: number) {
  const a15 = s.mfi15[i] <= 25 && s.pct15[i] <= 0.4
  const a1h = s.mfi1h[i] <= 25 && s.pct1h[i] <= 0.15
  const snipe = s.pct15[i] <= 0.12
  return { plan: a15 || a1h, snipe }
}

function evaluate(s: Series, i: number, g: { plan: boolean; snipe: boolean }, stats: Record<string, number>, v2Blockers: Record<string, number>): StepRec | null {
  const T = s.m15[i].ts + M15
  const frames = framesAt(s, i)
  const price = frames.m15.at(-1)!.c
  const plan = g.plan ? armPlan(frames) : null
  if (plan) stats.planCalls++
  const sniper = !(plan && plan.arm) && g.snipe ? sniperSignal(frames) : null
  if (sniper) stats.sniperCalls++
  let targets = null as ReturnType<typeof patternTargets> | null
  const targetsOf = () => (targets ??= patternTargets(frames, price))
  const live = liveSetup(frames, price, plan, sniper, targetsOf)
  const pub: PubRec | undefined =
    plan && plan.arm && 'tp1' in plan
      ? { type: plan.entryType, entry: plan.entryType === 'market' ? price : fmt8(plan.triggerPrice), stop: fmt8(plan.stop), target: fmt8(plan.tp1), conviction: plan.conviction, rr: plan.rr, reasons: plan.reasons }
      : undefined
  let v2: V2Read | undefined
  if (plan && 'level' in plan) {
    const read = v2Read(frames, { plan, nowMs: T, targets: targets ?? undefined })
    if (read.blocker) {
      const key = read.blocker.replace(/[\d.$,%?]+/g, '#').slice(0, 60)
      v2Blockers[key] = (v2Blockers[key] ?? 0) + 1
    } else v2 = { ...read, planReasons: [] }
  }
  if (live) stats.liveSetups++
  if (pub) stats.pubSetups++
  if (v2) stats.v2Reads++
  if (!live && !pub && !v2) return null
  const diag: Diag | undefined =
    plan && 'level' in plan
      ? { level: plan.level.price, tf: plan.level.tf, type: plan.level.type, dist: plan.level.dist, strength: plan.level.strength, confluence: plan.level.confluence, m15: s.mfi15[i], m1h: s.mfi1h[i] }
      : undefined
  return { i, ts: s.m15[i].ts, price, live: live ?? undefined, pub, v2, diag }
}

async function runWorker(o: Opts, market: string) {
  const s = await loadSeries(o, market)
  const w = windowOf(o, s)
  const hash = o.hash ?? codeHash()
  const t0 = Date.now()
  const stats: Record<string, number> = { steps: 0, passed: 0, planCalls: 0, sniperCalls: 0, liveSetups: 0, pubSetups: 0, v2Reads: 0, seconds: 0 }
  const v2Blockers: Record<string, number> = {}
  const recs: StepRec[] = []
  const rand = rng(12345)
  const skipped: number[] = []
  const passedIdx: number[] = []
  let nextLog = 0.1
  for (let i = w.from; i <= w.to; i++) {
    stats.steps++
    const g = gates(s, i)
    if (!g.plan && !g.snipe) {
      // Reservoir sample of skipped steps, to check the pre-filter really is lossless.
      if (skipped.length < o.validate) skipped.push(i)
      else if (rand() < o.validate / stats.steps) skipped[Math.floor(rand() * o.validate)] = i
      continue
    }
    stats.passed++
    if (passedIdx.length < o.validate) passedIdx.push(i)
    else if (rand() < o.validate / stats.passed) passedIdx[Math.floor(rand() * o.validate)] = i
    const rec = evaluate(s, i, g, stats, v2Blockers)
    if (rec) recs.push(rec)
    const done = (i - w.from) / (w.to - w.from)
    if (done >= nextLog) {
      nextLog += 0.1
      process.stdout.write(`  [${market}] ${Math.round(done * 100)}%  ${stats.passed} rule steps, ${recs.length} with a setup, ${((Date.now() - t0) / 60000).toFixed(1)} min\n`)
    }
  }

  // Validation 1: the v1 replica matched brain.ts readFrames on 250 of 250 steps on 4 Nov 2026. Since
  // 5 Nov the live brain runs v2 (engine/near/strategy.ts), so the replica is no longer compared to it.
  const liveMismatches: string[] = []
  const toCheck: number[] = []
  void passedIdx
  const byI = new Map(recs.map(r => [r.i, r]))
  for (const i of toCheck) {
    const frames = framesAt(s, i)
    const real = readFrames({ symbol: market, market } as unknown as Coin, frames).setup
    const mine = byI.get(i)?.live ?? null
    const same =
      (real == null && mine == null) ||
      (real != null && mine != null && (real.route as string) === mine.route && real.stop === mine.stop && real.target === mine.target && real.r1 === mine.r1)
    if (!same) liveMismatches.push(`${iso(s.m15[i].ts)} real=${JSON.stringify(real && { r: real.route, s: real.stop, t: real.target, r1: real.r1 })} mine=${JSON.stringify(mine && { r: mine.route, s: mine.stop, t: mine.target, r1: mine.r1 })}`)
  }
  // Validation 2: steps the pre-filter skipped must have no armPlan arm, no sniper fire, no v2 read.
  const prefilterLeaks: string[] = []
  for (const i of skipped) {
    const frames = framesAt(s, i)
    const plan = armPlan(frames)
    const sn = sniperSignal(frames)
    const read = 'level' in plan ? v2Read(frames, { plan, nowMs: s.m15[i].ts + M15 }) : null
    if (plan.arm || sn.fire || (read && !read.blocker)) prefilterLeaks.push(`${iso(s.m15[i].ts)} arm=${plan.arm} fire=${sn.fire} v2=${read ? !read.blocker : false}`)
  }
  stats.seconds = Math.round((Date.now() - t0) / 1000)
  const out: SignalFile = {
    market,
    hash,
    window: w,
    stats,
    v2Blockers,
    validation: { liveChecked: toCheck.length, liveMismatches, prefilterChecked: skipped.length, prefilterLeaks },
    dailyCheck: s.dailyCheck,
    recs,
  }
  writeFileSync(signalsPath(o, market, hash), JSON.stringify(out))
  process.stdout.write(`  [${market}] done in ${(stats.seconds / 60).toFixed(1)} min: ${stats.passed}/${stats.steps} steps needed rules, ${recs.length} kept\n`)
}

// ---------- simulation (cheap) ----------

type ExitWhy = 'stop' | 'breakeven' | 'target' | 'time' | 'r1' | 'end'
type Order = {
  kind: 'market' | 'limit'
  limit: number
  stop: number
  target: number
  r1: number | null
  maxHoldH: number
  /** Breakeven: after a 15m high at entry + 1R the stop moves to entry x (1 + lock). Null = off. */
  beLock: number | null
  route: string
  conviction: number
  reasons: string[]
  level: number | null
}
type Trade = {
  market: string
  route: string
  signalTs: number
  entryTs: number
  exitTs: number
  entry: number
  exit: number
  stop0: number
  target: number
  ret: number
  /** exit / entry - 1, before fees and slippage. */
  gross: number
  why: ExitWhy
  holdH: number
  mfe: number
  mae: number
  conviction: number
  regimeDown: boolean
  brokeLevel: boolean
  reasons: string[]
}
type Sim = { trades: Trade[]; eq: Float64Array }
type Pos = { o: Order; entry: number; entryTs: number; coins: number; cashIn: number; stop: number; risk: number; moved: boolean; hi: number; lo: number; signalTs: number; broke: boolean; regimeDown: boolean }

const r1d = (n: number) => Math.round(n * 10) / 10

/** brain.ts exitReason's "the move is tiring at first resistance" check, at the close of m15[i]. */
function r1Tiring(s: Series, i: number, p: Pos): boolean {
  const b = s.b1[i]
  const h1 = s.h1.slice(Math.max(0, b - 11), b)
  h1.push(s.p1[i])
  const m = s.mfi1h[i]
  const why = exitReason(
    { stop: p.stop, target: p.o.target, r1: p.o.r1, openedAt: 0, maxHoldSec: Infinity },
    { price: s.m15[i].c, mfi1h: Number.isFinite(m) ? r1d(Number(m.toFixed(1))) : null, frames: { h1 } as unknown as Frames },
  )
  return why != null && why.startsWith('the move is tiring')
}

function simulate(s: Series, w: Window, sigs: Map<number, StepRec>, decide: (r: StepRec) => Order | null): Sim {
  const slots = Math.round((w.endMs - w.startMs) / M15)
  const eq = new Float64Array(slots).fill(NaN)
  const trades: Trade[] = []
  let cash = 1
  let pos = null as Pos | null
  let pending = null as (Order & { placedAt: number; fillBy: number }) | null
  let entryNext = null as (Order & { signalTs: number }) | null
  let exitNext = null as ExitWhy | null
  let cooldownUntil = -Infinity

  const open = (o: Order, fill: number, ts: number, signalTs: number, i: number) => {
    pos = { o, entry: fill, entryTs: ts, coins: (cash * (1 - FEE)) / (fill * (1 + SLIP)), cashIn: cash, stop: o.stop, risk: fill - o.stop, moved: false, hi: fill, lo: fill, signalTs, broke: false, regimeDown: regimeDownAt(s, i) }
  }
  const close = (px: number, ts: number, why: ExitWhy) => {
    const p = pos!
    cash = p.coins * px * (1 - SLIP) * (1 - FEE)
    trades.push({
      market: s.market,
      route: p.o.route,
      signalTs: p.signalTs,
      entryTs: p.entryTs,
      exitTs: ts,
      entry: p.entry,
      exit: px,
      stop0: p.o.stop,
      target: p.o.target,
      ret: cash / p.cashIn - 1,
      gross: px / p.entry - 1,
      why,
      holdH: (ts - p.entryTs) / H1,
      mfe: p.hi / p.entry - 1,
      mae: p.lo / p.entry - 1,
      conviction: p.o.conviction,
      regimeDown: p.regimeDown,
      brokeLevel: p.broke,
      reasons: p.o.reasons,
    })
    pos = null
    cooldownUntil = ts + COOLDOWN_MS
  }

  for (let i = w.from; i <= w.to; i++) {
    const k = s.m15[i]
    const T = k.ts + M15
    // At the open: market orders decided at the previous close.
    if (pos && exitNext) close(k.o, k.ts, exitNext)
    exitNext = null
    if (!pos && entryNext) {
      open(entryNext, k.o, k.ts, entryNext.signalTs, i)
      entryNext = null
    }
    // A resting limit order.
    let limitFill = false
    if (!pos && pending) {
      if (k.ts >= pending.fillBy) pending = null
      else if (k.l <= pending.limit) {
        open(pending, Math.min(pending.limit, k.o), k.ts, pending.placedAt, i)
        pending = null
        limitFill = true
      }
    }
    // Inside the candle: the stop first; a target touched in a limit's fill candle may predate the fill.
    if (pos) {
      const p: Pos = pos
      if (k.l <= p.stop) close(k.o <= p.stop ? k.o : p.stop, T, p.moved ? 'breakeven' : 'stop')
      else if (!limitFill && k.h >= p.o.target) close(k.o >= p.o.target ? k.o : p.o.target, T, 'target')
    }
    // At the close: the time limit, the tiring-at-R1 exit, the breakeven move.
    if (pos) {
      const p: Pos = pos
      p.hi = Math.max(p.hi, k.h)
      p.lo = Math.min(p.lo, k.l)
      if (p.o.level != null && k.c < p.o.level * 0.99) p.broke = true
      if (T - p.entryTs >= p.o.maxHoldH * H1) close(k.c, T, 'time')
      else {
        if (p.o.r1 != null && k.c >= p.o.r1 && r1Tiring(s, i, p)) exitNext = 'r1'
        if (p.o.beLock != null && !p.moved && !limitFill && p.risk > 0 && k.h >= p.entry + p.risk) {
          p.stop = Math.max(p.stop, p.entry * (1 + p.o.beLock))
          p.moved = true
        }
      }
    }
    const slot = Math.round((k.ts - w.startMs) / M15)
    if (slot >= 0 && slot < slots) eq[slot] = pos ? pos.coins * k.c * (1 - SLIP) * (1 - FEE) : cash
    // The scan at the close.
    if (!pos && !entryNext && i < w.to && T >= cooldownUntil && (!pending || T - pending.placedAt >= COOLDOWN_MS)) {
      const rec = sigs.get(i)
      const o = rec ? decide(rec) : null
      if (o) {
        if (o.kind === 'market') {
          entryNext = { ...o, signalTs: T }
          pending = null
        } else pending = { ...o, placedAt: T, fillBy: T + PUB_FILL_MS }
      }
    }
  }
  if (pos) close(s.m15[w.to].c, s.m15[w.to].ts + M15, 'end')
  // Forward-fill any slot without a candle.
  let last = 1
  for (let t = 0; t < slots; t++) {
    if (Number.isNaN(eq[t])) eq[t] = last
    else last = eq[t]
  }
  return { trades, eq }
}

// ---------- strategies ----------

const v1Live = (r: StepRec): Order | null =>
  r.live
    ? { kind: 'market', limit: 0, stop: r.live.stop, target: r.live.target, r1: r.live.r1, maxHoldH: LIVE_MAX_HOLD_H, beLock: null, route: `v1 ${r.live.route}`, conviction: r.live.conviction, reasons: r.live.reasons, level: r.live.level ?? r.diag?.level ?? null }
    : null

const v1Pub = (r: StepRec): Order | null =>
  r.pub
    ? { kind: r.pub.type, limit: r.pub.entry, stop: r.pub.stop, target: r.pub.target, r1: null, maxHoldH: PUB_MAX_HOLD_H, beLock: null, route: `pub ${r.pub.type}`, conviction: r.pub.conviction, reasons: r.pub.reasons, level: r.diag?.level ?? null }
    : null

const v2Of = (p: V2Params) => (r: StepRec): Order | null => {
  if (!r.v2) return null
  const { setup } = v2Decide(r.v2, p)
  if (!setup) return null
  return { kind: 'market', limit: 0, stop: setup.stop, target: setup.target, r1: setup.r1, maxHoldH: p.maxHoldHours, beLock: p.breakeven ? p.breakevenLockPct : null, route: 'v2', conviction: setup.conviction, reasons: setup.reasons, level: setup.support }
}

// ---------- statistics ----------

type Stats = { n: number; win: number; avg: number; gross: number; med: number; comp: number; mdd: number; hold: number; stop: number; be: number; target: number; time: number; other: number; t: number; pf: number }

function median(xs: number[]): number {
  if (!xs.length) return 0
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

function maxDD(series: number[]): number {
  let peak = -Infinity
  let mdd = 0
  for (const v of series) {
    peak = Math.max(peak, v)
    mdd = Math.max(mdd, 1 - v / peak)
  }
  return mdd
}

type Period = { name: string; a: number; b: number; slotA: number; slotB: number }

function periodsOf(w: Window): Period[] {
  const slots = Math.round((w.endMs - w.startMs) / M15)
  const slot = (ms: number) => Math.max(0, Math.min(slots, Math.round((ms - w.startMs) / M15)))
  return [
    { name: 'all 12m', a: w.startMs, b: w.endMs, slotA: 0, slotB: slot(w.endMs) },
    { name: 'IS m1-8', a: w.startMs, b: w.splitMs, slotA: 0, slotB: slot(w.splitMs) },
    { name: 'OOS m9-12', a: w.splitMs, b: w.endMs, slotA: slot(w.splitMs), slotB: slot(w.endMs) },
  ]
}

/** Stats for a group of markets in a period. Compounding is per market (100% of its sleeve per trade);
 * a group is an equal-weight portfolio of sleeves rebalanced at the period start. */
function statsFor(sims: Sim[], per: Period): Stats {
  const trades = sims.flatMap(x => x.trades.filter(t => t.entryTs >= per.a && t.entryTs < per.b))
  const rets = trades.map(t => t.ret)
  const n = rets.length
  const avg = n ? rets.reduce((s, x) => s + x, 0) / n : 0
  const sd = n > 1 ? Math.sqrt(rets.reduce((s, x) => s + (x - avg) ** 2, 0) / (n - 1)) : 0
  const comps = sims.map(x => x.trades.filter(t => t.entryTs >= per.a && t.entryTs < per.b).reduce((c, t) => c * (1 + t.ret), 1) - 1)
  const port: number[] = []
  for (let t = per.slotA; t < per.slotB; t++) {
    let v = 0
    for (const x of sims) v += x.eq[t] / x.eq[per.slotA]
    port.push(v / sims.length)
  }
  const share = (f: (t: Trade) => boolean) => (n ? trades.filter(f).length / n : 0)
  const gains = rets.filter(r => r > 0).reduce((s, x) => s + x, 0)
  const losses = -rets.filter(r => r < 0).reduce((s, x) => s + x, 0)
  return {
    n,
    win: share(t => t.ret > 0),
    avg,
    gross: n ? trades.reduce((s, t) => s + t.gross, 0) / n : 0,
    med: median(rets),
    comp: comps.reduce((s, x) => s + x, 0) / Math.max(1, comps.length),
    mdd: maxDD(port),
    hold: n ? trades.reduce((s, t) => s + t.holdH, 0) / n : 0,
    stop: share(t => t.why === 'stop'),
    be: share(t => t.why === 'breakeven'),
    target: share(t => t.why === 'target'),
    time: share(t => t.why === 'time'),
    other: share(t => t.why === 'r1' || t.why === 'end'),
    t: n > 1 && sd > 0 ? avg / (sd / Math.sqrt(n)) : 0,
    pf: losses > 0 ? gains / losses : gains > 0 ? Infinity : 0,
  }
}

const P = (x: number, d = 1) => `${(x * 100).toFixed(d)}`
const pad = (s: string | number, n: number) => String(s).padStart(n)

function statsHeader(): string {
  return `${'period'.padEnd(10)} ${'market'.padEnd(9)} ${pad('trades', 6)} ${pad('win%', 5)} ${pad('avg%', 6)} ${pad('gross%', 6)} ${pad('med%', 6)} ${pad('comp%', 7)} ${pad('maxDD%', 6)} ${pad('hold h', 6)} ${pad('stop%', 5)} ${pad('be%', 4)} ${pad('tgt%', 5)} ${pad('time%', 5)} ${pad('oth%', 4)} ${pad('PF', 5)}`
}

function statsLine(per: string, mkt: string, x: Stats): string {
  return `${per.padEnd(10)} ${mkt.padEnd(9)} ${pad(x.n, 6)} ${pad(P(x.win, 0), 5)} ${pad(P(x.avg, 2), 6)} ${pad(P(x.gross, 2), 6)} ${pad(P(x.med, 2), 6)} ${pad(P(x.comp), 7)} ${pad(P(x.mdd), 6)} ${pad(x.hold.toFixed(0), 6)} ${pad(P(x.stop, 0), 5)} ${pad(P(x.be, 0), 4)} ${pad(P(x.target, 0), 5)} ${pad(P(x.time, 0), 5)} ${pad(P(x.other, 0), 4)} ${pad(Number.isFinite(x.pf) ? x.pf.toFixed(2) : 'inf', 5)}`
}

type Run = { name: string; sims: Map<string, Sim> }

function groups(markets: string[]): [string, string[]][] {
  const out: [string, string[]][] = markets.map(m => [m.replace('USDT', ''), [m]])
  const core = ['NEARUSDT', 'ZECUSDT'].filter(m => markets.includes(m))
  if (core.length === 2) out.push(['NEAR+ZEC', core])
  if (markets.length > 1) out.push(['ALL', markets])
  return out
}

function printRun(run: Run, w: Window, markets: string[], pers = periodsOf(w)) {
  console.log(statsHeader())
  for (const per of pers) {
    for (const [label, ms] of groups(markets)) console.log(statsLine(per.name, label, statsFor(ms.map(m => run.sims.get(m)!), per)))
    console.log('')
  }
}

function worst(run: Run, n = 5) {
  const all = [...run.sims.values()].flatMap(x => x.trades).sort((a, b) => a.ret - b.ret).slice(0, n)
  for (const t of all) {
    console.log(`  ${P(t.ret, 1).padStart(6)}%  ${t.market.padEnd(8)} ${iso(t.entryTs)} -> ${iso(t.exitTs)}  ${t.route}, ${t.why}  entry ${t.entry.toPrecision(5)} stop ${t.stop0.toPrecision(5)} (${P(1 - t.stop0 / t.entry)}%) target ${t.target.toPrecision(5)} (+${P(t.target / t.entry - 1)}%)  best +${P(t.mfe)}%${t.regimeDown ? '  [daily downtrend]' : ''}`)
    for (const r of t.reasons.slice(0, 4)) console.log(`          - ${r.slice(0, 170)}`)
  }
}

/** Why v1 lost: the shape of the losing trades. */
function lossAnatomy(run: Run) {
  const all = [...run.sims.values()].flatMap(x => x.trades)
  const losers = all.filter(t => t.ret <= 0)
  const winners = all.filter(t => t.ret > 0)
  if (!losers.length) return console.log('  no losing trades')
  const sh = (xs: Trade[], f: (t: Trade) => boolean) => `${P(xs.filter(f).length / Math.max(1, xs.length), 0)}%`
  const avg = (xs: Trade[], f: (t: Trade) => number) => (xs.length ? xs.reduce((s, t) => s + f(t), 0) / xs.length : 0)
  console.log(`  ${losers.length} losing or flat of ${all.length} trades (${winners.length} winners)`)
  console.log(`  exit:          losers stop ${sh(losers, t => t.why === 'stop')}, time ${sh(losers, t => t.why === 'time')}, other ${sh(losers, t => t.why === 'r1' || t.why === 'end')}`)
  console.log(`  daily trend:   ${sh(losers, t => t.regimeDown)} of losers vs ${sh(winners, t => t.regimeDown)} of winners were bought under a falling daily EMA50`)
  console.log(`  stop distance: losers avg ${P(avg(losers, t => 1 - t.stop0 / t.entry))}%, winners avg ${P(avg(winners, t => 1 - t.stop0 / t.entry))}%`)
  console.log(`  target dist:   losers avg +${P(avg(losers, t => t.target / t.entry - 1))}%, winners avg +${P(avg(winners, t => t.target / t.entry - 1))}%; target reached by ${sh(all, t => t.why === 'target')} of all trades`)
  console.log(`  avg loss:      stop-outs ${P(avg(losers.filter(t => t.why === 'stop'), t => t.ret), 2)}%, time exits ${P(avg(losers.filter(t => t.why === 'time'), t => t.ret), 2)}%`)
  console.log(`  went green first: ${sh(losers, t => t.mfe >= 0.02)} of losers were +2% up at some point, ${sh(losers, t => t.mfe >= 0.03)} were +3% up`)
  console.log(`  level broke:   ${sh(losers, t => t.brokeLevel)} of losers closed a 15m candle >1% under the support they were bought on (winners ${sh(winners, t => t.brokeLevel)})`)
  const routes = [...new Set(all.map(t => t.route))]
  for (const r of routes) {
    const xs = all.filter(t => t.route === r)
    console.log(`  route ${r.padEnd(12)} ${pad(xs.length, 4)} trades, win ${P(xs.filter(t => t.ret > 0).length / xs.length, 0)}%, avg ${P(avg(xs, t => t.ret), 2)}%`)
  }
}

// ---------- main ----------

function runWorkers(o: Opts, markets: string[], hash: string): Promise<void> {
  const script = fileURLToPath(import.meta.url)
  const queue = [...markets]
  const one = (): Promise<void> => {
    const m = queue.shift()
    if (!m) return Promise.resolve()
    return new Promise<void>((res, rej) => {
      const strip = new Set(['--worker', '--end', '--hash'])
      const args = [...process.argv.slice(2).filter((x, i, a) => !strip.has(x) && !strip.has(a[i - 1])), '--worker', m, '--end', String(o.endMs), '--hash', hash]
      const child = fork(script, args, { stdio: 'inherit' })
      child.on('exit', code => (code === 0 ? res() : rej(new Error(`worker ${m} exited with ${code}`))))
    }).then(one)
  }
  return Promise.all(Array.from({ length: Math.min(o.jobs, markets.length) }, one)).then(() => undefined)
}

async function main() {
  const o = parseOpts()
  mkdirSync(o.cache, { recursive: true })
  if (o.worker) return runWorker(o, o.worker)

  const hash = codeHash()
  console.log(`ST Quant history test: ${o.markets.join(', ')}; ${o.days} days to ${iso(o.endMs)} UTC; cache ${o.cache}; rules ${hash}`)
  console.log(`Costs: ${P(FEE)}% fee + ${P(SLIP)}% slippage per side. One position per market, ${COOLDOWN_MS / H1}h cooldown after an exit.\n`)
  const series = new Map<string, Series>()
  for (const m of o.markets) series.set(m, await loadSeries(o, m))
  const need = o.markets.filter(m => o.fresh || !existsSync(signalsPath(o, m, hash)))
  if (need.length) {
    console.log(`Signal pass for ${need.join(', ')} (${o.jobs} at a time)...`)
    await runWorkers(o, need, hash)
  }
  const files = new Map<string, SignalFile>()
  for (const m of o.markets) files.set(m, JSON.parse(readFileSync(signalsPath(o, m, hash), 'utf8')))

  const w0 = files.get(o.markets[0])!.window
  console.log(`\nWindow ${iso(w0.startMs)} -> ${iso(w0.endMs)}; in-sample to ${iso(w0.splitMs)}, out-of-sample after.`)
  console.log('Signal pass and checks:')
  for (const [m, f] of files) {
    const s = f.stats
    const v = f.validation
    console.log(`  ${m.padEnd(9)} ${s.passed}/${s.steps} steps needed rules (${s.planCalls} armPlan, ${s.sniperCalls} sniper), setups: v1 ${s.liveSetups}, published ${s.pubSetups}, v2 candidates ${s.v2Reads}; ${(s.seconds / 60).toFixed(1)} min`)
    console.log(`  ${''.padEnd(9)} v1 replica vs brain.ts readFrames: ${v.liveChecked - v.liveMismatches.length}/${v.liveChecked} identical; pre-filter: ${v.prefilterChecked - v.prefilterLeaks.length}/${v.prefilterChecked} skipped steps confirmed empty; daily candles vs 15m: ${f.dailyCheck.days} days, max close diff ${f.dailyCheck.maxCloseDiff.toExponential(1)}`)
    for (const x of [...v.liveMismatches, ...v.prefilterLeaks].slice(0, 5)) console.log(`      ! ${x}`)
  }

  const sigsOf = new Map<string, Map<number, StepRec>>()
  for (const [m, f] of files) sigsOf.set(m, new Map(f.recs.map(r => [r.i, r])))
  const runOf = (name: string, decide: (r: StepRec) => Order | null): Run => {
    const sims = new Map<string, Sim>()
    for (const m of o.markets) {
      const s = series.get(m)!
      const w = windowOf(o, s)
      sims.set(m, simulate(s, w, sigsOf.get(m)!, decide))
    }
    return { name, sims }
  }
  const w = windowOf(o, series.get(o.markets[0])!)
  const [, IS, OOS] = periodsOf(w)

  const v1 = runOf('v1', v1Live)
  const pub = runOf('v1-pub', v1Pub)

  // v2 grid, ranked on the in-sample months only.
  type Cell = { p: V2Params; key: string; is: Stats; oos: Stats; run: Run; score: number }
  const cells: Cell[] = []
  for (const maxStopPct of GRID.maxStopPct)
    for (const minRR of GRID.minRR)
      for (const maxHoldHours of GRID.maxHoldHours)
        for (const breakeven of GRID.breakeven)
          for (const regimeFilter of GRID.regimeFilter)
            for (const planVetoes of GRID.planVetoes) {
              const p: V2Params = { ...BASE, maxStopPct, minRR, maxHoldHours, breakeven, regimeFilter, planVetoes }
              const run = runOf('v2', v2Of(p))
              const sims = o.markets.map(m => run.sims.get(m)!)
              const key = `stop<=${P(maxStopPct, 0)}% rr>=${minRR} ${maxHoldHours}h be=${breakeven ? 'on' : 'off'} regime=${regimeFilter ? 'on' : 'off'} vetoes=${planVetoes}`
              cells.push({ p, key, is: statsFor(sims, IS), oos: statsFor(sims, OOS), run, score: 0 })
            }
  // Score = in-sample t-stat of the per-trade return, averaged with the neighbouring cells (one grid step
  // in stop, R:R or hold, same switches) so a lone lucky cell does not win.
  const MIN_IS_TRADES = 20
  const tOf = (c: Cell) => (c.is.n >= MIN_IS_TRADES ? c.is.t : -9)
  const idx = (arr: number[], v: number) => arr.indexOf(v)
  for (const c of cells) {
    const near = cells.filter(
      d =>
        d.p.breakeven === c.p.breakeven &&
        d.p.regimeFilter === c.p.regimeFilter &&
        d.p.planVetoes === c.p.planVetoes &&
        Math.abs(idx(GRID.maxStopPct, d.p.maxStopPct) - idx(GRID.maxStopPct, c.p.maxStopPct)) +
          Math.abs(idx(GRID.minRR, d.p.minRR) - idx(GRID.minRR, c.p.minRR)) +
          Math.abs(idx(GRID.maxHoldHours, d.p.maxHoldHours) - idx(GRID.maxHoldHours, c.p.maxHoldHours)) <=
          1,
    )
    c.score = near.reduce((s, d) => s + tOf(d), 0) / near.length
  }
  const ranked = [...cells].sort((a, b) => b.score - a.score)
  const best = ranked[0]

  console.log('\n=== v1: live NEAR brain (market-only armPlan + sniper setups, brain.ts exits, 120h limit) ===')
  printRun(v1, w, o.markets)
  console.log('=== v1-pub: as published (armPlan market + limit entries, its stop and tp1, 48h limit) ===')
  printRun(pub, w, o.markets)

  console.log(`=== v2 grid: ${cells.length} cells, ranked on months 1-8 (score = in-sample t-stat of per-trade return, averaged with grid neighbours; cells under ${MIN_IS_TRADES} trades score -9) ===`)
  console.log(`${'cell'.padEnd(62)} ${pad('score', 5)} | ${pad('IS n', 4)} ${pad('win%', 4)} ${pad('avg%', 6)} ${pad('comp%', 6)} ${pad('t', 5)} | ${pad('OOS n', 5)} ${pad('win%', 4)} ${pad('avg%', 6)} ${pad('comp%', 6)}`)
  for (const c of ranked.slice(0, 12)) {
    console.log(`${c.key.padEnd(62)} ${pad(c.score.toFixed(2), 5)} | ${pad(c.is.n, 4)} ${pad(P(c.is.win, 0), 4)} ${pad(P(c.is.avg, 2), 6)} ${pad(P(c.is.comp), 6)} ${pad(c.is.t.toFixed(2), 5)} | ${pad(c.oos.n, 5)} ${pad(P(c.oos.win, 0), 4)} ${pad(P(c.oos.avg, 2), 6)} ${pad(P(c.oos.comp), 6)}`)
  }
  const isPos = cells.filter(c => c.is.avg > 0).length
  const oosPos = cells.filter(c => c.oos.avg > 0).length
  const bothPos = cells.filter(c => c.is.avg > 0 && c.oos.avg > 0).length
  console.log(`  cells with a positive average trade: in-sample ${isPos}/${cells.length}, out-of-sample ${oosPos}/${cells.length}, both ${bothPos}`)
  const top = ranked.slice(0, 12)
  console.log(`  top-12 in-sample cells out of sample: avg trade ${P(top.reduce((s, c) => s + c.oos.avg, 0) / top.length, 2)}%, mean OOS comp ${P(top.reduce((s, c) => s + c.oos.comp, 0) / top.length)}%`)

  console.log(`\n=== v2 chosen: ${best.key} ===`)
  printRun(best.run, w, o.markets)

  // Switch one thing at a time around the chosen cell.
  console.log('=== v2 sensitivity around the chosen cell (all markets) ===')
  console.log(`${'variant'.padEnd(44)} | ${pad('IS n', 4)} ${pad('win%', 4)} ${pad('avg%', 6)} ${pad('gross%', 6)} ${pad('comp%', 6)} | ${pad('OOS n', 5)} ${pad('win%', 4)} ${pad('avg%', 6)} ${pad('gross%', 6)} ${pad('comp%', 6)}`)
  const variants: [string, Partial<V2Params>][] = [
    ['chosen', {}],
    ['conviction >= 4', { minConviction: 4 }],
    [`armPlan vetoes: ${best.p.planVetoes === 'all' ? 'level only' : 'all (incl. trend)'}`, { planVetoes: best.p.planVetoes === 'all' ? 'level' : 'all' }],
    ['armPlan vetoes: none', { planVetoes: 'none' }],
    [`regime filter ${best.p.regimeFilter ? 'off' : 'on'}`, { regimeFilter: !best.p.regimeFilter }],
    [`breakeven ${best.p.breakeven ? 'off' : 'on'}`, { breakeven: !best.p.breakeven }],
    ['wider band (1% above, 0.5% below)', { bandAbovePct: 0.01, bandBelowPct: 0.005 }],
    ['stop 1.0x ATR', { stopAtrMult: 1 }],
    ['stop 1.5x ATR', { stopAtrMult: 1.5 }],
    ['stop 2.0x ATR, max stop 6%', { stopAtrMult: 2, maxStopPct: 0.06 }],
  ]
  for (const [name, change] of variants) {
    const p = { ...best.p, ...change }
    const run = runOf('v2', v2Of(p))
    const sims = o.markets.map(m => run.sims.get(m)!)
    const a = statsFor(sims, IS)
    const b = statsFor(sims, OOS)
    console.log(`${name.padEnd(44)} | ${pad(a.n, 4)} ${pad(P(a.win, 0), 4)} ${pad(P(a.avg, 2), 6)} ${pad(P(a.gross, 2), 6)} ${pad(P(a.comp), 6)} | ${pad(b.n, 5)} ${pad(P(b.win, 0), 4)} ${pad(P(b.avg, 2), 6)} ${pad(P(b.gross, 2), 6)} ${pad(P(b.comp), 6)}`)
  }

  console.log('\n=== 5 worst trades: v1 ===')
  worst(v1)
  console.log('\n=== 5 worst trades: v1-pub ===')
  worst(pub)
  console.log(`\n=== 5 worst trades: v2 chosen ===`)
  worst(best.run)
  console.log('\n=== why v1 lost (live brain) ===')
  lossAnatomy(v1)
  console.log('\n=== why v1 lost (as published) ===')
  lossAnatomy(pub)

  const v2Why: Record<string, number> = {}
  for (const f of files.values()) for (const [k, n] of Object.entries(f.v2Blockers)) v2Why[k] = (v2Why[k] ?? 0) + n
  console.log('\n=== where v2 candidates stop (steps with a level, before parameters) ===')
  for (const [k, n] of Object.entries(v2Why).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${pad(n, 6)}  ${k}`)
  const after: Record<string, number> = {}
  let cands = 0
  for (const f of files.values()) {
    for (const r of f.recs) {
      if (!r.v2) continue
      cands++
      const why = v2Decide(r.v2, best.p).blocker ?? 'SETUP (taken unless a position or cooldown is running)'
      const key = why.replace(/[\d.$,%?]+/g, '#').replace(/—.*$/, '').slice(0, 70)
      after[key] = (after[key] ?? 0) + 1
    }
  }
  console.log(`  ...then, of the ${cands} steps that pass the MFI gate within 1% of the level, the chosen parameters stop them at:`)
  for (const [k, n] of Object.entries(after).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${pad(n, 6)}  ${k}`)

  // Data for inspection: every trade, and the whole grid.
  const csv = ['strategy,market,route,signal,entry_time,exit_time,entry,exit,stop,target,ret_pct,gross_pct,exit_why,hold_h,mfe_pct,conviction,daily_down']
  for (const run of [v1, pub, { ...best.run, name: 'v2' }]) {
    for (const t of [...run.sims.values()].flatMap(x => x.trades)) {
      csv.push([run.name, t.market, t.route, iso(t.signalTs), iso(t.entryTs), iso(t.exitTs), t.entry, t.exit, t.stop0, t.target, P(t.ret, 3), P(t.gross, 3), t.why, t.holdH.toFixed(2), P(t.mfe, 2), t.conviction, t.regimeDown ? 1 : 0].join(','))
    }
  }
  const tag = `${stamp(o.endMs)}-${o.days}d`
  writeFileSync(join(o.cache, `trades-${tag}.csv`), csv.join('\n'))
  writeFileSync(join(o.cache, `grid-${tag}.json`), JSON.stringify(cells.map(c => ({ key: c.key, params: c.p, score: c.score, is: c.is, oos: c.oos })), null, 1))
  console.log(`\nTrades: ${join(o.cache, `trades-${tag}.csv`)}\nGrid:   ${join(o.cache, `grid-${tag}.json`)}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
