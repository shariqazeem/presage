import { mfi } from '@/engine/stquant/indicators'
import { fitBoundary, resistanceZones, supportZones } from '@/engine/stquant/structure'
import type { Candle } from '@/lib/market/types'

/**
 * What ParallaxPay draws on a chart, computed with its own code: the support and resistance zones it
 * maps from swing points (with how many times price touched each), the boundary trendlines it fits the
 * way a trader draws them, and money flow (MFI). Same functions and the same candle window as the chart
 * image it reads every 15 minutes (engine/stquant/charts.js), so the drawing on screen is its reading.
 */

export type DrawTf = '15m' | '1h' | '4h' | '1d'

/** How many candles it looks at on each timeframe. */
export const WINDOW: Record<DrawTf, number> = { '1d': 240, '4h': 160, '1h': 130, '15m': 120 }

/** Extra candles fetched before the window so money flow has its 14-candle warm-up. */
export const WARMUP = 15

export type Level = { side: 'support' | 'resistance'; price: number; touches: number }
export type Trend = { side: 'support' | 'resistance'; from: number; y0: number; y1: number; touches: number; direction: 'rising' | 'falling' | 'flat' }

export type Drawing = {
  /** The window it reads, oldest first. Indexes below refer to this array. */
  candles: Candle[]
  levels: Level[]
  trends: Trend[]
  /** Money flow per candle in the window; null during warm-up. */
  flow: (number | null)[]
  last: number
}

export function readChart(all: Candle[], tf: DrawTf): Drawing | null {
  if (all.length < 30) return null
  const candles = all.slice(-WINDOW[tf])
  const n = candles.length
  const last = candles[n - 1].c
  const levels: Level[] = [
    ...supportZones(candles)
      .filter(z => z.touches >= 2)
      .slice(0, 3)
      .map(z => ({ side: 'support' as const, price: z.price, touches: z.touches })),
    ...resistanceZones(candles)
      .filter(z => z.touches >= 2)
      .slice(0, 3)
      .map(z => ({ side: 'resistance' as const, price: z.price, touches: z.touches })),
  ]
  const trends: Trend[] = []
  for (const side of ['lower', 'upper'] as const) {
    const b = fitBoundary(candles, side)
    if (!b) continue
    const from = Math.max(0, b.startIdx)
    const y0 = b.valueAt(from)
    const y1 = b.valueAt(n - 1)
    if (!(y0 > 0 && y1 > 0)) continue
    trends.push({ side: side === 'lower' ? 'support' : 'resistance', from, y0, y1, touches: b.touches, direction: b.direction })
  }
  const m = mfi(all)
  const flow = m ? m.slice(-n) : new Array<number | null>(n).fill(null)
  return { candles, levels, trends, flow, last }
}

/** A price the way the drawing labels it: whole dollars above $1,000, 3 decimals above $1, 4 significant digits below. */
export function px(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`
  if (p >= 100) return `$${p.toFixed(1)}`
  if (p >= 1) return `$${p.toFixed(3)}`
  return `$${Number(p.toPrecision(4))}`
}
