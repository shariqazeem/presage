import { loadFrames } from '../../lib/market/frames'
import type { Frames } from '../../lib/market/types'
import { assetOf, type Coin } from '../../lib/near/config'
import { armPlan, higherTfQuality } from '../stquant/arming.js'
import { ema, ord } from '../stquant/indicators.js'
import { mfiExtreme, supportMap } from '../stquant/sniper.js'
import { V2_DEFAULTS, stquantV2Explain } from './strategy'
import { patternTargets } from '../stquant/structure.js'

/**
 * The founder's ParallaxPay method (engine/stquant/RUBRIC.md), read on one coin: buy at a level more
 * than one timeframe agrees on, only when MFI has bottomed; sell at the pattern's resistance. The
 * vault trades at market, so only market entries become setups; a limit plan is shown as armed.
 */

export type Setup = {
  route: 'v2'
  price: number
  stop: number
  /** R2, the pattern's own resistance: reaching it is the exit. */
  target: number
  /** R1, the first major resistance: passed through unless the move is dying there. */
  r1: number | null
  conviction: number
  rr: number
  reasons: string[]
}

/** One line of the agent's checklist, the way a trader runs down a chart before buying. */
export type Check = { key: string; label: string; ok: boolean | null; note: string }

export type Read = {
  coin: Coin
  at: number
  price: number
  mfi15: number | null
  mfi15Pct: number | null
  mfi1h: number | null
  mfi1hPct: number | null
  support: { price: number; tf: string; kind: string } | null
  supportDistPct: number | null
  /** A limit plan waiting for price to come down to it. */
  armedAt: number | null
  setup: Setup | null
  blocker: string | null
  /** The levels the agent has drawn, for the live chart. */
  levels: { support: number | null; r1: number | null; r2: number | null }
  /** Hourly closes over the last two days, for the token list's sparkline. */
  spark: number[]
  change24h: number | null
  checks: Check[]
  /** One plain sentence for the feed. */
  line: string
  frames: Frames
}

const sig = (n: number) => Number(n.toPrecision(6))
const r1d = (n: number) => Math.round(n * 10) / 10

export function usd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (n >= 10) return `$${n.toFixed(2)}`
  if (n >= 0.01 || n <= 0) return `$${n.toFixed(n >= 1 ? 3 : 4)}`
  // Coins priced in tiny fractions keep four significant digits: $0.000000008893, not $0.0000.
  return `$${n.toFixed(Math.min(20, 3 - Math.floor(Math.log10(n))))}`
}

export async function readCoin(coin: Coin): Promise<Read> {
  const frames = await loadFrames(assetOf(coin))
  return readFrames(coin, frames)
}

export function readFrames(coin: Coin, frames: Frames): Read {
  const price = frames.m15.at(-1)!.c
  const x15 = mfiExtreme(frames.m15)
  const x1h = mfiExtreme(frames.h1)

  let support: Read['support'] = null
  for (const [tf, list] of Object.entries(supportMap(frames))) {
    for (const s of list) {
      if ((price - s.price) / price >= -0.01 && (!support || s.price > support.price)) support = { price: s.price, tf, kind: s.type.replace('trendline-', '') }
    }
  }
  const supportDistPct = support ? ((price - support.price) / price) * 100 : null

  // One look at the plan, shared: v2 keeps armPlan's level and money-flow gate and replaces its risk.
  // There is no sniper fallback any more: the history test traced most of v1's losses to it.
  const plan = armPlan(frames, { symbol: coin.symbol })
  const v2 = stquantV2Explain(frames, V2_DEFAULTS, { plan })
  const targets = patternTargets(frames, price)
  const setup: Setup | null = v2.setup
    ? { route: 'v2', price, stop: v2.setup.stop, target: v2.setup.target, r1: v2.setup.r1, conviction: v2.setup.conviction, rr: v2.setup.rr, reasons: v2.setup.reasons }
    : null
  // A limit plan from armPlan, shown as "armed" while price is above the level. v2 only buys at market.
  const armedAt = !setup && plan.arm && 'tp1' in plan && plan.entryType === 'limit' ? sig(plan.triggerPrice) : null

  const blocker = setup ? null : v2.blocker
  const level = 'level' in plan ? plan.level : null
  const htf = higherTfQuality(frames)
  const e50 = ema(frames.d1, 50)
  const e50before = ema(frames.d1.slice(0, -5), 50)
  const dayClose = frames.d1.at(-1)!.c
  const dailyFalling = e50 != null && e50before != null && dayClose < e50 && e50 < e50before
  const bottom15 = x15 != null && x15.value <= 20 && x15.percentile <= 0.15
  const bottom1h = x1h != null && x1h.value <= 25 && x1h.percentile <= 0.15
  const rr = setup?.rr ?? ('rr' in plan ? plan.rr : null)
  const pct = (n: number) => `${ord(Math.round(n * 100))} percentile`
  const checks: Check[] = [
    {
      key: 'support',
      label: 'Price is on support',
      ok: supportDistPct != null && supportDistPct >= -1 && supportDistPct <= 2.5,
      note: support && supportDistPct != null ? `${support.tf} ${support.kind} at ${usd(support.price)}, ${Math.abs(supportDistPct).toFixed(1)}% ${supportDistPct >= 0 ? 'below' : 'above'}` : 'no level close enough',
    },
    {
      key: 'structure',
      label: 'The level shows on a higher timeframe',
      ok: level ? level.structural : null,
      note: level ? `${level.tf} ${level.type.replace('trendline-', '')} line, ${level.strength} touches, ${level.confluence} timeframe${level.confluence === 1 ? '' : 's'} agree` : 'no level in reach',
    },
    {
      key: 'momentum',
      label: 'Momentum has bottomed',
      ok: x15 || x1h ? bottom15 || bottom1h : null,
      note: `15m MFI ${x15 ? `${Math.round(x15.value)} (${pct(x15.percentile)})` : '—'} · 1H MFI ${x1h ? `${Math.round(x1h.value)} (${pct(x1h.percentile)})` : '—'}`,
    },
    { key: 'htf', label: 'The bigger picture is constructive', ok: !htf.weak, note: htf.notes.slice(0, 2).join('; ') || 'no clear structure on 1D/4H' },
    {
      key: 'trend',
      label: 'The daily trend is not falling',
      ok: e50 == null ? null : !dailyFalling,
      note: e50 != null ? `daily close ${((dayClose / e50 - 1) * 100).toFixed(1)}% ${dayClose >= e50 ? 'above' : 'below'} its 50-day average` : 'not enough daily history',
    },
    {
      key: 'room',
      label: 'At least 2.5× the risk to the next resistance',
      ok: setup ? true : /stop would sit|no resistance|pays/.test(v2.blocker ?? '') ? false : null,
      note: setup ? `${setup.rr.toFixed(1)}× the risk to ${usd(setup.target)}, stop ${usd(setup.stop)}` : 'measured once price is at the level',
    },
  ]
  return {
    coin,
    at: Math.floor(Date.now() / 1000),
    price,
    mfi15: x15 ? r1d(x15.value) : null,
    mfi15Pct: x15 ? Math.round(x15.percentile * 100) : null,
    mfi1h: x1h ? r1d(x1h.value) : null,
    mfi1hPct: x1h ? Math.round(x1h.percentile * 100) : null,
    support,
    supportDistPct: supportDistPct == null ? null : r1d(supportDistPct),
    armedAt,
    setup,
    blocker,
    levels: { support: support?.price ?? null, r1: targets.r1 ? sig(targets.r1.price) : null, r2: targets.r2 ? sig(targets.r2.price) : null },
    spark: frames.h1.slice(-48).map(k => sig(k.c)),
    change24h: frames.h1.length > 24 ? Math.round((price / frames.h1.at(-25)!.c - 1) * 10_000) / 10_000 : null,
    checks,
    line: narrate(coin, price, x1h?.value ?? null, x1h ? x1h.percentile : null, support, supportDistPct, setup, armedAt),
    frames,
  }
}

/** What the agent sees, said the way a trader would say it to a friend. */
function narrate(
  coin: Coin,
  price: number,
  mfi1h: number | null,
  mfi1hPct: number | null,
  support: Read['support'],
  distPct: number | null,
  setup: Setup | null,
  armedAt: number | null,
): string {
  const where =
    support && distPct != null
      ? distPct >= 0
        ? `${support.tf} support at ${usd(support.price)} is ${distPct.toFixed(1)}% below`
        : `just under the ${support.tf} level at ${usd(support.price)}, which I need it to win back`
      : 'no support close enough to lean on'
  // The agent speaks for itself, in the first person, on the floor and in its answers.
  if (setup) {
    return `${coin.symbol} ${usd(price)} is on its ${support ? `${support.tf} support` : 'support'} with money flow washed out. My plan: buy, stop ${usd(setup.stop)}, target ${usd(setup.target)} (${setup.rr.toFixed(1)}R).`
  }
  if (armedAt) return `${coin.symbol} ${usd(price)}: the setup is there but price is above it. I'm waiting for ${usd(armedAt)}.`
  const mom =
    mfi1h == null
      ? ''
      : mfi1hPct != null && mfi1hPct <= 0.15
        ? " Money flow is near its low, so I'm watching closely."
        : mfi1h >= 80
          ? " Money flow is stretched. I don't chase."
          : ' Money flow is mid-range, so I wait.'
  return `${coin.symbol} ${usd(price)}, ${where}.${mom}`
}

/** Exits from the rubric: the stop, R2, R1 only if the move is dying there, or the time limit. */
export function exitReason(
  pos: { stop: number; target: number; r1: number | null; openedAt: number; maxHoldSec: number },
  read: Pick<Read, 'price' | 'mfi1h' | 'frames'>,
): string | null {
  const { price } = read
  if (price <= pos.stop) return `stop hit at ${usd(price)}`
  if (price >= pos.target) return `target reached at ${usd(price)}`
  if (pos.r1 != null && price >= pos.r1 && read.mfi1h != null && read.mfi1h >= 80) {
    const h1 = read.frames.h1
    const recentHigh = Math.max(...h1.slice(-4).map(k => k.h))
    const priorHigh = Math.max(...h1.slice(-12, -4).map(k => k.h))
    const vol = (ks: typeof h1) => ks.reduce((s, k) => s + k.v, 0) / ks.length
    if (recentHigh <= priorHigh || vol(h1.slice(-3)) < 0.7 * vol(h1.slice(-12, -3))) return `the move is tiring at first resistance ${usd(pos.r1)}`
  }
  if (Date.now() / 1000 - pos.openedAt >= pos.maxHoldSec) return 'time limit reached'
  return null
}
