import { mfi } from '@/engine/stquant/indicators'
import { fitBoundary, levels as findLevels, tolerances } from '@/engine/stquant/structure'
import type { Candle } from '@/lib/market/types'

/**
 * What ParallaxPay draws on a chart, computed with its own code:
 * - the horizontal levels it maps from swing highs and lows, with each touch and a role taken from
 *   where price is now;
 * - the trendlines it fits the way a trader draws them, through swing points price respects, with
 *   the candles they touched;
 * - money flow (MFI).
 * Same functions and the same candle window as the chart image it reads every 15 minutes
 * (engine/stquant/charts.js), so the drawing on screen is its reading.
 */

export type DrawTf = '15m' | '1h' | '4h' | '1d'

/** How many candles it looks at on each timeframe. */
export const WINDOW: Record<DrawTf, number> = { '1d': 240, '4h': 160, '1h': 130, '15m': 120 }

/** Extra candles fetched before the window so money flow has its 14-candle warm-up. */
export const WARMUP = 15

export type Level = {
  role: 'support' | 'resistance'
  price: number
  /** The level's thickness: its lowest and highest touch. */
  lo: number
  hi: number
  touches: number
  /** Touched from both sides: resistance that became support, or the reverse. */
  flipped: boolean
  /** Index of its first touch in `candles`. */
  first: number
  /** Every swing that touched it. */
  points: { i: number; price: number }[]
  /** The nearest support under price and the nearest resistance above it. */
  key: boolean
}

export type Trend = {
  side: 'support' | 'resistance'
  /** Index of its first touch. */
  from: number
  /** Its price at `from`, and how much it moves per candle. Extends past the last candle. */
  y0: number
  slope: number
  touches: number
  /** The candles it touched. */
  touchIdx: number[]
  direction: 'rising' | 'falling' | 'flat'
}

export type Drawing = {
  /** The window it reads, oldest first. Indexes below refer to this array. */
  candles: Candle[]
  /** Levels touched at least twice, most-touched first. */
  levels: Level[]
  trends: Trend[]
  /** Money flow per candle in the window; null during warm-up. */
  flow: (number | null)[]
  last: number
  /** A normal candle's range as a share of price. */
  bar: number
}

export const trendAt = (t: Trend, i: number) => t.y0 + t.slope * (i - t.from)

export function readChart(all: Candle[], tf: DrawTf): Drawing | null {
  if (all.length < 30) return null
  const candles = all.slice(-WINDOW[tf])
  const n = candles.length
  const last = candles[n - 1].c
  const found = findLevels(candles).filter(l => l.touches >= 2)
  const below = found.filter(l => l.role === 'support').sort((a, b) => b.price - a.price)[0]
  const above = found.filter(l => l.role === 'resistance').sort((a, b) => a.price - b.price)[0]
  const levels: Level[] = found.map(l => ({
    role: l.role,
    price: l.price,
    lo: l.lo,
    hi: l.hi,
    touches: l.touches,
    flipped: l.flipped,
    first: l.first,
    points: l.points.map(p => ({ i: p.i, price: p.price })),
    key: l === below || l === above,
  }))
  const trends: Trend[] = []
  for (const side of ['lower', 'upper'] as const) {
    const b = fitBoundary(candles, side)
    if (!b) continue
    const from = Math.max(0, b.startIdx)
    const y0 = b.valueAt(from)
    if (!(y0 > 0 && b.valueAt(n - 1) > 0)) continue
    trends.push({ side: side === 'lower' ? 'support' : 'resistance', from, y0, slope: b.slope, touches: b.touches, touchIdx: b.touchIdx, direction: b.direction })
  }
  const m = mfi(all)
  const flow = m ? m.slice(-n) : new Array<number | null>(n).fill(null)
  return { candles, levels, trends, flow, last, bar: tolerances(candles).bar }
}

const TF_MS: Record<DrawTf, number> = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 }

/**
 * The drawing with the live price on its newest candle: it moves the candle that is still forming, or
 * starts the next one once that candle has closed. Only the candles change. The levels and trendlines
 * stay the ones the agent read, so they don't twitch with every tick.
 */
export function withLive(d: Drawing, live: number | null | undefined, tf: DrawTf, now = Date.now()): Drawing {
  if (!live || !(live > 0)) return d
  const last = d.candles[d.candles.length - 1]
  // A price far from the drawn candles is a bad quote, not a move.
  if (Math.abs(live / last.c - 1) > 0.15) return d
  const step = TF_MS[tf]
  if (now < last.ts + step) {
    const k = { ...last, c: live, h: Math.max(last.h, live), l: Math.min(last.l, live) }
    return { ...d, candles: [...d.candles.slice(0, -1), k], last: live }
  }
  const ts = Math.floor(now / step) * step
  const k = { ts, o: last.c, h: Math.max(last.c, live), l: Math.min(last.c, live), c: live, v: 0 }
  return { ...d, candles: [...d.candles, k], flow: [...d.flow, null], last: live }
}

/** The shortest timeframe whose window still reaches back to a moment `sec` seconds ago. */
export function tfForAge(sec: number): DrawTf {
  if (sec < 4.5 * 86_400) return '1h'
  if (sec < 24 * 86_400) return '4h'
  return '1d'
}

/** A price the way the drawing labels it: whole dollars above $1,000, 3 decimals above $1, 4 significant digits below. */
export function px(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`
  if (p >= 100) return `$${p.toFixed(1)}`
  if (p >= 1) return `$${p.toFixed(3)}`
  return `$${Number(p.toPrecision(4))}`
}
