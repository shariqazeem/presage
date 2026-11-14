import type { Candle, Frames } from '../../lib/market/types'
import { ARM, armPlan, type ArmPlan } from '../stquant/arming.js'
import { atr, ema, mfi, ord } from '../stquant/indicators.js'
import { mfiExtreme } from '../stquant/sniper.js'
import { fitBoundary, patternTargets, resistanceZones } from '../stquant/structure.js'

/**
 * ST Quant v2: the same level and the same "money flow has bottomed" gate as v1 (armPlan), with the
 * three things the v1 history test blamed fixed: the stop sits just under the level instead of 6-14%
 * below it, the target is the first real resistance that pays at least `minRR` times the risk instead
 * of a far pump tip, and a daily-downtrend filter keeps it from buying supports in a falling market.
 *
 * Market entries only. `stquantV2(frames)` gives the setup or null; `stquantV2Explain(frames)` also
 * says why there is none. The live agent passes nothing else: the last 15m candle is treated as still
 * forming, judged by the clock. A history test passes `nowMs` (and the plan it already computed).
 *
 * Measured by scripts/near/backtest.ts (Binance NEAR, ZEC, BTC, ETH, SOL, Nov 2025 - Nov 2026, 0.3% fee
 * + 0.1% slippage a side). V2_DEFAULTS are the least-bad cell of its grid on months 1-8. Every cell lost
 * money in months 1-8 AND in months 9-12: before costs the entries are a coin flip, and the 0.8% round
 * trip is the loss. Not proven: it trades live only inside members' limits (largest buy, buys a day), and
 * its sealed record is the live test. The README says so under Known limits.
 */

export type V2Params = {
  /** Skip when the last daily close is under the daily EMA50 and that EMA is lower than 5 days ago. */
  regimeFilter: boolean
  /** Entry band around the support: price at most this far above it... */
  bandAbovePct: number
  /** ...or at most this far below it (the last closed 15m candle must still have closed above it). */
  bandBelowPct: number
  /** Stop = support - max(stopAtrMult x 1h ATR(14), stopMinPct x support). */
  stopAtrMult: number
  stopMinPct: number
  /** The stop is never closer to the entry than this. */
  minStopDistPct: number
  /** Skip the trade when the stop would sit further than this below the entry. */
  maxStopPct: number
  /** The target is the first resistance at least this many times the risk above the entry. */
  minRR: number
  /** Once a 15m high reaches entry + 1R, move the stop to entry + breakevenLockPct (fees covered). */
  breakeven: boolean
  breakevenLockPct: number
  /** Sell at market when neither stop nor target is hit within this many hours. */
  maxHoldHours: number
  /** armPlan's conviction (1-5) must be at least this. */
  minConviction: number
  /** Which of armPlan's own vetoes still apply. 'level': only the ones about the level itself (too few
   * touches, price mid-range above the real pattern support, line already broken). 'all': also its trend
   * and momentum vetoes (higher timeframe not constructive, 1D collapse, 1H MFI hot), which the regime
   * filter is meant to replace. 'none': ignore them. Its stop/target and MFI vetoes are always replaced. */
  planVetoes: 'level' | 'all' | 'none'
}

/** The grid's best in-sample cell (scripts/near/backtest.ts, months 1-8); it still lost money in and out of sample. */
export const V2_DEFAULTS: V2Params = {
  regimeFilter: true,
  bandAbovePct: 0.005,
  bandBelowPct: 0.003,
  stopAtrMult: 0.6,
  stopMinPct: 0.006,
  minStopDistPct: 0.008,
  maxStopPct: 0.04,
  minRR: 2.5,
  breakeven: false,
  breakevenLockPct: 0.008,
  maxHoldHours: 72,
  minConviction: 3,
  planVetoes: 'all',
}

export type V2Setup = {
  route: 'v2'
  /** Price when the setup was read; the entry is a market buy. */
  price: number
  stop: number
  target: number
  /** First major resistance below the target: passed through unless the move is tiring there. */
  r1: number | null
  rr: number
  conviction: number
  support: number
  /** When price reaches this (entry + 1R) the stop moves to `breakevenStop`. Null when breakeven is off.
   * Both are measured from `price`; an executor should re-measure them from its actual fill. */
  breakevenAt: number | null
  breakevenStop: number | null
  maxHoldSec: number
  reasons: string[]
}

type Level = ArmPlan['level']

/** Everything v2 needs from one look at the chart, before any parameter is applied. */
export type V2Read = {
  price: number
  nowMs: number
  level: Level | null
  conviction: number
  planReasons: string[]
  /** armPlan's vetoes v2 may keep (see `planVetoes`). */
  planBlockers: string[]
  mfi: { m15: number | null; pct15: number | null; m1h: number | null; pct1h: number | null; bottom15: boolean; bottom1h: boolean }
  /** Close of the last closed 15m candle, and price vs the support as a fraction of the support. */
  trigger: { lastClose: number | null; distPct: number | null }
  /** Daily EMA50 regime from closed daily candles; null when there is too little history. */
  regime: { close: number; ema: number; emaPrev: number; downtrend: boolean } | null
  atr1h: number | null
  r1: { price: number; tf: string } | null
  /** Resistances above price, lowest first: candidates for the target. */
  ladder: { price: number; label: string }[]
  /** Set when no parameter choice could make this a trade (no level, MFI not bottomed, not at the level). */
  blocker: string | null
}

const M15 = 15 * 60_000
const D1 = 86_400_000
const REGIME_EMA = 50
const REGIME_LOOKBACK_DAYS = 5
/** A level further than this from price is not "at the level" under any band v2 would use. */
const LOOSE_BAND = 0.01
const MAX_TARGET_PCT = Number(ARM.maxTargetPct ?? 0.3)
// armPlan's own "MFI at its bottom" thresholds, read from the same constants it uses.
const IDEAL_MFI_15 = Number(ARM.idealMfiAtEntry ?? 20)
const BOTTOM_PCT = Number(ARM.bottomPercentile ?? 0.15)
const HOURLY_BOTTOM_MFI = Number(ARM.hourlyBottomMfi ?? 25)

// armPlan vetoes v2 replaces with its own rules: its stop/target ("risk tight") and its MFI wording,
// since v2 applies the stricter bottom gate itself.
const REPLACED_BLOCKERS = [/^risk tight/, /^15m MFI/, /^price is at the level but MFI/, /^cannot read 15m MFI/]
// armPlan vetoes about the level itself, as opposed to trend or momentum.
const LEVEL_BLOCKERS = [/^level has only/, /above the real pattern support/, /^line already broken/]

const sig = (n: number) => Number(n.toPrecision(6))
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

function usd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (n >= 10) return `$${n.toFixed(2)}`
  return `$${n.toFixed(n >= 1 ? 3 : 4)}`
}

function levelName(type: string): string {
  if (type === 'horizontal') return 'horizontal support'
  if (type === 'pattern-apex') return 'wedge support'
  return `${type.replace('trendline-', '')} trendline`
}

/** Resistances above `price`: the pattern's major rejections and boundary, and 1h/4h resistance. */
function resistanceLadder(frames: Frames, price: number, targets: ReturnType<typeof patternTargets>): V2Read['ladder'] {
  const out: V2Read['ladder'] = []
  const ceiling = price * (1 + MAX_TARGET_PCT)
  const add = (p: number, label: string) => {
    if (Number.isFinite(p) && p > price && p <= ceiling) out.push({ price: p, label })
  }
  for (const r of targets.all) {
    const story = r.rallyPct != null && r.dropPct != null ? `: it rallied ${pct(r.rallyPct, 0)} into it, then fell ${pct(r.dropPct, 0)}` : ''
    add(r.price, `${r.tf} major rejection${story}`)
  }
  if (targets.r2) add(targets.r2.price, `${targets.r2.tf} pattern boundary (${targets.r2.kind.replace('pattern-boundary-', '')}, ${targets.r2.touches} touches)`)
  // The same windows nearestRejector uses: the next real obstacle on 4H and 1H.
  for (const [tf, arr, bars] of [['4H', frames.h4, 160], ['1H', frames.h1, 130]] as const) {
    if (!arr?.length) continue
    const win = arr.slice(-bars)
    for (const z of resistanceZones(win)) if (z.touches >= 2) add(z.price, `${tf} resistance that turned price back ${z.touches} times`)
    const line = fitBoundary(win, 'upper')
    if (line) add(line.valueAt(win.length - 1), `${tf} ${line.direction} upper trendline (${line.touches} touches)`)
  }
  return out.sort((a, b) => a.price - b.price)
}

function lastClosed(candles: Candle[], tfMs: number, nowMs: number): number {
  for (let i = candles.length - 1; i >= 0; i--) if (candles[i].ts + tfMs <= nowMs) return i
  return -1
}

/** Read the chart once. Cheap when there is no trade; the target ladder is only built when there could be. */
export function v2Read(
  frames: Frames,
  opts: { plan?: ReturnType<typeof armPlan>; nowMs?: number; targets?: ReturnType<typeof patternTargets> } = {},
): V2Read {
  const nowMs = opts.nowMs ?? Date.now()
  const price = frames.m15.at(-1)!.c
  const read: V2Read = {
    price,
    nowMs,
    level: null,
    conviction: 0,
    planReasons: [],
    planBlockers: [],
    mfi: { m15: null, pct15: null, m1h: null, pct1h: null, bottom15: false, bottom1h: false },
    trigger: { lastClose: null, distPct: null },
    regime: null,
    atr1h: null,
    r1: null,
    ladder: [],
    blocker: null,
  }
  const plan = opts.plan ?? armPlan(frames)
  if (!('level' in plan)) {
    read.blocker = plan.blockers[0] ?? 'no support near price'
    return read
  }
  const level = plan.level
  read.level = level
  read.conviction = plan.conviction
  read.planReasons = plan.reasons
  read.planBlockers = plan.blockers.filter(b => !REPLACED_BLOCKERS.some(re => re.test(b)))

  // The gate armPlan uses for a market entry: 15m MFI at its bottom, or 1H MFI at its bottom on a level
  // a higher timeframe confirms.
  const m15 = mfi(frames.m15)?.at(-1) ?? null
  const m1h = mfi(frames.h1)?.at(-1) ?? null
  const x15 = mfiExtreme(frames.m15)
  const x1h = mfiExtreme(frames.h1)
  const bottom15 = m15 != null && m15 <= IDEAL_MFI_15 && x15 != null && x15.percentile <= BOTTOM_PCT
  const bottom1h = m1h != null && m1h <= HOURLY_BOTTOM_MFI && x1h != null && x1h.percentile <= BOTTOM_PCT && level.structural === true
  read.mfi = { m15, pct15: x15?.percentile ?? null, m1h, pct1h: x1h?.percentile ?? null, bottom15, bottom1h }

  const li = lastClosed(frames.m15, M15, nowMs)
  read.trigger = { lastClose: li >= 0 ? frames.m15[li].c : null, distPct: (price - level.price) / level.price }

  const d1 = frames.d1.slice(0, lastClosed(frames.d1, D1, nowMs) + 1)
  if (d1.length >= REGIME_EMA + REGIME_LOOKBACK_DAYS + 1) {
    const e = ema(d1, REGIME_EMA)!
    const ePrev = ema(d1.slice(0, -REGIME_LOOKBACK_DAYS), REGIME_EMA)!
    const close = d1.at(-1)!.c
    read.regime = { close, ema: e, emaPrev: ePrev, downtrend: close < e && e < ePrev }
  }
  read.atr1h = atr(frames.h1, 14)

  if (!bottom15 && !bottom1h) {
    read.blocker = `money flow has not bottomed (15m MFI ${m15?.toFixed(0) ?? '?'} at the ${ord(Math.round((x15?.percentile ?? 1) * 100))} percentile, 1H MFI ${m1h?.toFixed(0) ?? '?'} at the ${ord(Math.round((x1h?.percentile ?? 1) * 100))})`
    return read
  }
  const dist = read.trigger.distPct!
  if (dist > LOOSE_BAND || dist < -LOOSE_BAND) {
    read.blocker = dist > 0
      ? `price is ${pct(dist)} above the support at ${usd(level.price)}: waiting for it to come to the level`
      : `price is ${pct(-dist)} under the support at ${usd(level.price)}: the level is not holding`
    return read
  }
  const targets = opts.targets ?? patternTargets(frames, price)
  read.r1 = targets.r1 ? { price: targets.r1.price, tf: targets.r1.tf } : null
  read.ladder = resistanceLadder(frames, price, targets)
  return read
}

/** Apply the parameters to a read: the setup, or the first reason there is none. */
export function v2Decide(read: V2Read, p: V2Params = V2_DEFAULTS): { setup: V2Setup | null; blocker: string | null } {
  const no = (blocker: string) => ({ setup: null, blocker })
  if (read.blocker || !read.level) return no(read.blocker ?? 'no support near price')
  const level = read.level
  const price = read.price
  const dist = read.trigger.distPct!
  if (dist > p.bandAbovePct) return no(`price is ${pct(dist)} above the support at ${usd(level.price)}: waiting for it to come to the level`)
  if (dist < -p.bandBelowPct) return no(`price is ${pct(-dist)} under the support at ${usd(level.price)}: the level is not holding`)
  if (read.trigger.lastClose == null || !(read.trigger.lastClose > level.price)) {
    return no(`the last 15m candle closed under the support at ${usd(level.price)}`)
  }
  const vetoes = p.planVetoes === 'none' ? [] : p.planVetoes === 'all' ? read.planBlockers : read.planBlockers.filter(b => LEVEL_BLOCKERS.some(re => re.test(b)))
  if (vetoes.length) return no(vetoes[0])
  if (read.conviction < p.minConviction) return no(`conviction ${read.conviction}/5 (needs ${p.minConviction})`)
  if (p.regimeFilter && read.regime?.downtrend) {
    return no(`daily downtrend: the close ${usd(read.regime.close)} is under a falling 50-day average (${usd(read.regime.ema)})`)
  }
  if (read.atr1h == null) return no('not enough hourly candles to size the stop')

  let stop = level.price - Math.max(p.stopAtrMult * read.atr1h, p.stopMinPct * level.price)
  if ((price - stop) / price < p.minStopDistPct) stop = price * (1 - p.minStopDistPct)
  const riskPct = (price - stop) / price
  if (riskPct > p.maxStopPct) return no(`the stop would sit ${pct(riskPct)} below the entry (max ${pct(p.maxStopPct, 0)}): the level is too far under a sane stop`)
  const risk = price - stop
  const need = price + p.minRR * risk
  const target = read.ladder.find(r => r.price >= need)
  if (!target) {
    const near = read.ladder[0]
    return no(near
      ? `the nearest resistance ${usd(near.price)} pays only ${((near.price - price) / risk).toFixed(1)}R and nothing within +${pct(MAX_TARGET_PCT, 0)} pays ${p.minRR}R`
      : `no resistance within +${pct(MAX_TARGET_PCT, 0)} to aim at`)
  }
  const rr = (target.price - price) / risk
  const r1 = read.r1 && read.r1.price > price && read.r1.price < target.price ? read.r1.price : null
  const beAt = p.breakeven ? price + risk : null
  const beStop = p.breakeven ? price * (1 + p.breakevenLockPct) : null

  const reasons: string[] = []
  reasons.push(`Price is on ${level.tf} ${levelName(level.type)} at ${usd(level.price)} (${level.strength} touches, ${level.confluence} timeframe${level.confluence === 1 ? '' : 's'} agreeing${level.structural ? ', confirmed on a higher timeframe' : ''}).`)
  reasons.push(dist >= 0
    ? `It is ${pct(dist)} above that support and the last 15-minute candle closed above it, so the level is holding.`
    : `It dipped ${pct(-dist)} under that support but the last 15-minute candle closed above it, so the level is holding.`)
  if (read.mfi.bottom15) reasons.push(`Selling has run dry on the 15-minute chart: money flow ${read.mfi.m15!.toFixed(0)}, in the lowest ${Math.max(1, Math.round(read.mfi.pct15! * 100))}% of its recent range.`)
  else reasons.push(`Selling has run dry on the hourly chart: money flow ${read.mfi.m1h!.toFixed(0)}, in the lowest ${Math.max(1, Math.round(read.mfi.pct1h! * 100))}% of its recent range, on a level a higher timeframe confirms.`)
  if (!read.regime) reasons.push('Not enough daily history to read the trend.')
  else if (read.regime.downtrend) reasons.push(`The daily trend is down (close under a falling 50-day average); the trend filter is off.`)
  else if (read.regime.close >= read.regime.ema) reasons.push(`The daily trend is fine: the close ${usd(read.regime.close)} is above the 50-day average ${usd(read.regime.ema)}.`)
  else reasons.push(`Price is under its 50-day average but that average is still rising, so this is a dip, not a downtrend.`)
  reasons.push(`Stop ${usd(stop)}, just under the support: ${pct(riskPct)} risk. Closing there means the level failed.`)
  reasons.push(`Target ${usd(target.price)}, the ${target.label}: +${pct((target.price - price) / price)}, ${rr.toFixed(1)} times the risk.`)
  if (r1 != null) reasons.push(`First resistance ${usd(r1)} is passed through unless the move is tiring there.`)
  if (beAt != null && beStop != null) reasons.push(`Once price reaches ${usd(beAt)} (one times the risk), the stop moves to ${usd(beStop)} so fees are covered.`)
  reasons.push(`If neither is hit within ${p.maxHoldHours} hours, sell at market.`)
  reasons.push(`Conviction ${read.conviction}/5.`)

  return {
    setup: {
      route: 'v2',
      price,
      stop: sig(stop),
      target: sig(target.price),
      r1: r1 == null ? null : sig(r1),
      rr: Math.round(rr * 100) / 100,
      conviction: read.conviction,
      support: sig(level.price),
      breakevenAt: beAt == null ? null : sig(beAt),
      breakevenStop: beStop == null ? null : sig(beStop),
      maxHoldSec: Math.round(p.maxHoldHours * 3600),
      reasons,
    },
    blocker: null,
  }
}

/** The v2 setup with the reason there is none. `opts.nowMs` decides which candles are closed (default: now). */
export function stquantV2Explain(
  frames: Frames,
  params: V2Params = V2_DEFAULTS,
  opts: { plan?: ReturnType<typeof armPlan>; nowMs?: number } = {},
): { setup: V2Setup | null; blocker: string | null } {
  return v2Decide(v2Read(frames, opts), params)
}

export function stquantV2(frames: Frames, params: V2Params = V2_DEFAULTS, opts: { nowMs?: number } = {}): V2Setup | null {
  return stquantV2Explain(frames, params, opts).setup
}
