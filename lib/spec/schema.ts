import { z } from 'zod'
import { ORACLE_ASSETS } from '../oracle-assets'

/**
 * A creator's strategy, as data. Every field maps to something ST Quant's library already computes,
 * and nothing in a spec is ever executed as code. If an idea can't be said in these terms, the
 * compiler says what is missing and refuses, rather than guessing.
 */

export const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const
const Tf = z.enum(TIMEFRAMES)

const SUPPORTED_MARKETS = new Set(ORACLE_ASSETS.map(a => a.market))

export const LevelRef = z.discriminatedUnion('kind', [
  /** The nearest support on a timeframe at or below price (the one price is sitting on), optionally of one type. */
  z.object({
    kind: z.literal('support'),
    tf: Tf,
    type: z.enum(['any', 'horizontal', 'trendline-rising', 'trendline-falling', 'pattern-apex']).default('any'),
  }),
  /** The multi-timeframe pattern support ST Quant's exits and entries agree on. */
  z.object({ kind: z.literal('patternSupport') }),
  /** TP1 in the rubric: the high of the largest recent 4H pump candle within +30%. */
  z.object({ kind: z.literal('firstRejection') }),
  /** The nearest level above price that has rejected it before (4H and 1H zones and lines). */
  z.object({ kind: z.literal('nearestResistance') }),
  /** The lowest low / highest high of the last N candles. */
  z.object({ kind: z.literal('recentLow'), tf: Tf, bars: z.number().int().min(3).max(200) }),
  z.object({ kind: z.literal('recentHigh'), tf: Tf, bars: z.number().int().min(3).max(200) }),
])
export type LevelRef = z.infer<typeof LevelRef>

export const Condition = z.discriminatedUnion('kind', [
  /** MFI(14) compared with a number. */
  z.object({ kind: z.literal('mfi'), tf: Tf, op: z.enum(['<=', '>=']), value: z.number().min(0).max(100) }),
  /** Where the latest MFI sits among its last 100 readings: 0 is the lowest, 1 the highest. */
  z.object({ kind: z.literal('mfiPercentile'), tf: Tf, op: z.enum(['<=', '>=']), value: z.number().min(0).max(1) }),
  /** MFI ticked up on the last candle after falling. */
  z.object({ kind: z.literal('mfiTurningUp'), tf: Tf }),
  /** Price at or within `withinPct` percent above a level (and not more than 1% under it). */
  z.object({ kind: z.literal('nearLevel'), level: LevelRef, withinPct: z.number().min(0.1).max(10) }),
  /** EMA20 above (up) or below (down) EMA50. */
  z.object({ kind: z.literal('trend'), tf: Tf, dir: z.enum(['up', 'down']) }),
  /** Price above or below an EMA. */
  z.object({ kind: z.literal('priceVsEma'), tf: Tf, period: z.union([z.literal(20), z.literal(50), z.literal(200)]), op: z.enum(['above', 'below']) }),
  /** Bullish divergence: price made a lower low while MFI made a higher low. */
  z.object({ kind: z.literal('bullishDivergence'), tf: Tf }),
  /** Last candle's volume at least `mult` times the 20-candle average. */
  z.object({ kind: z.literal('volumeSpike'), tf: Tf, mult: z.number().min(1.1).max(10) }),
  /** Price change over the last `bars` candles. */
  z.object({ kind: z.literal('change'), tf: Tf, bars: z.number().int().min(1).max(200), op: z.enum(['<=', '>=']), pct: z.number().min(-90).max(500) }),
  /** ATR(14) as a share of price is at least this many percent: the chart moves enough to trade. */
  z.object({ kind: z.literal('minVolatility'), tf: Tf, atrPct: z.number().min(0.05).max(20) }),
])
export type Condition = z.infer<typeof Condition>

export const StrategySpec = z.object({
  v: z.literal(1),
  kind: z.literal('setup'),
  side: z.literal('long'),
  markets: z
    .array(z.string())
    .min(1)
    .max(8)
    .refine(ms => ms.every(m => SUPPORTED_MARKETS.has(m)), 'Every market must be one Called supports'),
  /** All conditions must hold at once. */
  when: z.array(Condition).min(1).max(8),
  entry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('market') }),
    z.object({ type: z.literal('limit'), level: LevelRef, abovePct: z.number().min(0).max(3).default(0.3) }),
  ]),
  stop: z.discriminatedUnion('type', [
    z.object({ type: z.literal('belowLevel'), level: LevelRef, pct: z.number().min(0).max(15) }),
    z.object({ type: z.literal('atr'), tf: Tf, mult: z.number().min(0.5).max(6) }),
    z.object({ type: z.literal('pct'), pct: z.number().min(0.3).max(25) }),
  ]),
  target: z.discriminatedUnion('type', [
    z.object({ type: z.literal('level'), level: LevelRef }),
    z.object({ type: z.literal('r'), multiple: z.number().min(0.5).max(10) }),
    z.object({ type: z.literal('pct'), pct: z.number().min(0.3).max(100) }),
  ]),
  /** Skip a setup whose reward to target is less than this many times its risk. */
  minRR: z.number().min(0.5).max(10).default(1.5),
  fillWindowHours: z.number().min(1).max(72).default(24),
  maxHoldHours: z.number().min(1).max(240).default(48),
  cooldownHours: z.number().min(1).max(72).default(6),
})
export type StrategySpec = z.infer<typeof StrategySpec>

/** The exact bytes whose keccak256 is sealed on chain. Keys in a fixed order, no whitespace. */
export function canonicalSpec(spec: StrategySpec): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sort((v as Record<string, unknown>)[k])]))
        : v
  return JSON.stringify(sort(spec))
}
