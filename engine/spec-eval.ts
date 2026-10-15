import type { Candle, Frames } from '../lib/market/types'
import type { Condition, LevelRef, StrategySpec } from '../lib/spec/schema'
import { atr, bullishDivergence, ema, mfi, ord, volumeSpike } from './stquant/indicators.js'
import { firstRejection, nearestRejector } from './stquant/arming.js'
import { keySupports, mfiExtreme } from './stquant/sniper.js'
import { patternSupport } from './stquant/structure.js'

/** Windows ST Quant reads support on, per timeframe (sniper.js supportMap). */
const SUPPORT_WINDOW = { '15m': 299, '1h': 299, '4h': 299, '1d': 240 } as const

const series = (f: Frames, tf: keyof typeof SUPPORT_WINDOW): Candle[] =>
  tf === '15m' ? f.m15 : tf === '1h' ? f.h1 : tf === '4h' ? f.h4 : f.d1

const n = (x: number, d = 2) => Number(x.toFixed(d))

export function levelPrice(f: Frames, l: LevelRef, price: number): number | null {
  switch (l.kind) {
    case 'support': {
      const list = keySupports(series(f, l.tf).slice(-SUPPORT_WINDOW[l.tf])) as { type: string; price: number; strength: number }[]
      const pick = list.filter(s => l.type === 'any' || s.type === l.type)
      return pick[0]?.price ?? null // highest at or below price: the one price is sitting on
    }
    case 'patternSupport':
      return patternSupport(f, price)?.price ?? null
    case 'firstRejection':
      return firstRejection(f, price) ?? null
    case 'nearestResistance':
      return nearestRejector(f, price)?.price ?? null
    case 'recentLow':
      return Math.min(...series(f, l.tf).slice(-l.bars).map(k => k.l))
    case 'recentHigh':
      return Math.max(...series(f, l.tf).slice(-l.bars).map(k => k.h))
  }
}

/** Check one condition and say what was seen, so every call explains itself. */
export function check(f: Frames, c: Condition, price: number): { ok: boolean; saw: string } {
  const k = 'tf' in c ? series(f, c.tf) : f.m15
  switch (c.kind) {
    case 'mfi': {
      const v = mfi(k)?.at(-1)
      if (v == null) return { ok: false, saw: `${c.tf} MFI unavailable` }
      return { ok: c.op === '<=' ? v <= c.value : v >= c.value, saw: `${c.tf} MFI ${n(v, 1)}` }
    }
    case 'mfiPercentile': {
      const x = mfiExtreme(k)
      if (!x) return { ok: false, saw: `${c.tf} MFI history too short` }
      return {
        ok: c.op === '<=' ? x.percentile <= c.value : x.percentile >= c.value,
        saw: `${c.tf} MFI ${n(x.value, 1)}, at the ${ord(Math.round(x.percentile * 100))} percentile of its last 100 readings`,
      }
    }
    case 'mfiTurningUp': {
      const x = mfiExtreme(k)
      return { ok: Boolean(x?.turningUp), saw: `${c.tf} MFI ${x?.turningUp ? 'turning up' : 'not turning up'}` }
    }
    case 'nearLevel': {
      const lvl = levelPrice(f, c.level, price)
      if (lvl == null) return { ok: false, saw: 'no such level near price' }
      const dist = ((price - lvl) / price) * 100
      return { ok: dist >= -1 && dist <= c.withinPct, saw: `price ${n(dist)}% above the level at ${Number(lvl.toPrecision(6))}` }
    }
    case 'trend': {
      const a = ema(k, 20)
      const b = ema(k, 50)
      if (a == null || b == null) return { ok: false, saw: `${c.tf} averages unavailable` }
      const up = a > b
      return { ok: c.dir === 'up' ? up : !up, saw: `${c.tf} trend ${up ? 'up' : 'down'}` }
    }
    case 'priceVsEma': {
      const e = ema(k, c.period)
      if (e == null) return { ok: false, saw: `${c.tf} ${c.period}-average needs more history` }
      const above = price > e
      return { ok: c.op === 'above' ? above : !above, saw: `price ${above ? 'above' : 'below'} the ${c.tf} ${c.period}-average` }
    }
    case 'bullishDivergence': {
      const d = bullishDivergence(k)
      return { ok: Boolean(d?.diverging), saw: d?.diverging ? `${c.tf} bullish divergence (MFI +${d.mfiChange})` : `no ${c.tf} divergence` }
    }
    case 'volumeSpike':
      return { ok: Boolean(volumeSpike(k, c.mult, 20)), saw: `${c.tf} volume ${volumeSpike(k, c.mult, 20) ? 'spiked' : 'normal'}` }
    case 'change': {
      const then = k.at(-1 - c.bars)?.c
      if (!then) return { ok: false, saw: 'not enough candles' }
      const ch = ((price - then) / then) * 100
      return { ok: c.op === '<=' ? ch <= c.pct : ch >= c.pct, saw: `${n(ch)}% over ${c.bars} ${c.tf} candles` }
    }
    case 'minVolatility': {
      const a = atr(k)
      if (!a) return { ok: false, saw: 'ATR unavailable' }
      const p = (a / price) * 100
      return { ok: p >= c.atrPct, saw: `${c.tf} ATR ${n(p)}% of price` }
    }
  }
}

export type SpecSignal = {
  entry: { type: 'market' | 'limit'; price: number }
  stop: number
  target: number
  rr: number
  why: string[]
}

const fmt = (x: number) => Number(x.toPrecision(8))

/** Run a spec on one market's frames. Returns a setup only if every condition holds and the numbers make sense. */
export function evaluate(spec: StrategySpec, f: Frames): { signal: SpecSignal | null; blocked?: string; checks: { ok: boolean; saw: string }[] } {
  const price = f.m15.at(-1)!.c
  const checks = spec.when.map(c => check(f, c, price))
  if (!checks.every(c => c.ok)) return { signal: null, checks }

  let entry: SpecSignal['entry'] = { type: 'market', price }
  if (spec.entry.type === 'limit') {
    const lvl = levelPrice(f, spec.entry.level, price)
    if (lvl == null) return { signal: null, checks, blocked: 'entry level not found' }
    const limit = lvl * (1 + spec.entry.abovePct / 100)
    entry = limit < price ? { type: 'limit', price: limit } : { type: 'market', price }
  }

  let stop: number | null = null
  if (spec.stop.type === 'belowLevel') {
    const lvl = levelPrice(f, spec.stop.level, price)
    stop = lvl == null ? null : lvl * (1 - spec.stop.pct / 100)
  } else if (spec.stop.type === 'atr') {
    const a = atr(series(f, spec.stop.tf))
    stop = a ? entry.price - spec.stop.mult * a : null
  } else {
    stop = entry.price * (1 - spec.stop.pct / 100)
  }
  if (stop == null || !(stop < entry.price)) return { signal: null, checks, blocked: 'stop is not below the entry' }

  let target: number | null = null
  if (spec.target.type === 'level') target = levelPrice(f, spec.target.level, entry.price)
  else if (spec.target.type === 'r') target = entry.price + spec.target.multiple * (entry.price - stop)
  else target = entry.price * (1 + spec.target.pct / 100)
  if (target == null || !(target > entry.price)) return { signal: null, checks, blocked: 'target is not above the entry' }

  const rr = (target - entry.price) / (entry.price - stop)
  if (rr < spec.minRR) return { signal: null, checks, blocked: `only ${rr.toFixed(2)}R to the target` }

  return {
    checks,
    signal: {
      entry: { type: entry.type, price: fmt(entry.price) },
      stop: fmt(stop),
      target: fmt(target),
      rr: Number(rr.toFixed(2)),
      why: [...checks.map(c => c.saw), `${rr.toFixed(1)}R to the target`],
    },
  }
}
