/**
 * A strategy, as the building blocks people choose. The agent maps them onto its own settings (the v2
 * strategy's parameters, engine/near/strategies.ts), so a member's strategy runs on exactly the engine,
 * the reads and the analyst the house strategy does. The house blocks map to the house settings exactly.
 */

export type Blocks = {
  /** How close to the level it buys. */
  entry: 'at' | 'close' | 'near'
  /** Where the stop goes under the level. */
  stop: 'tight' | 'normal' | 'wide'
  /** The reward it needs, in multiples of the risk, before it buys. */
  reward: 1.5 | 2 | 2.5 | 3 | 4
  /** The longest it holds a trade, in hours. */
  hold: 24 | 72 | 168
  /** Stay out while the daily trend is falling. */
  trend: boolean
  /** The least conviction (out of 5) a setup needs. */
  picky: 2 | 3 | 4 | 5
}

export const HOUSE_ID = 'house'
export const HOUSE_NAME = 'ParallaxPay'
export const HOUSE: Blocks = { entry: 'close', stop: 'normal', reward: 2.5, hold: 72, trend: true, picky: 3 }

type Option<V> = { value: V; label: string; line: string }
export type BlockDef = { [K in keyof Blocks]: { key: K; label: string; question: string; options: Option<Blocks[K]>[] } }[keyof Blocks]

export const BLOCK_DEFS: BlockDef[] = [
  {
    key: 'entry',
    label: 'Entry',
    question: 'How close to the level does it buy?',
    options: [
      { value: 'at', label: 'At it', line: 'Only right on the level. Fewer trades, tighter risk.' },
      { value: 'close', label: 'Close', line: 'Within half a percent above it. The house way.' },
      { value: 'near', label: 'Near', line: 'Up to 1% above it. More trades, a little more risk.' },
    ],
  },
  {
    key: 'stop',
    label: 'Stop',
    question: 'Where does the stop go?',
    options: [
      { value: 'tight', label: 'Tight', line: 'Just under the level. Small losses, stopped out more often.' },
      { value: 'normal', label: 'Normal', line: 'Under the level by its usual swing. The house way.' },
      { value: 'wide', label: 'Wide', line: 'Room to breathe. Fewer stop-outs, bigger losses when wrong.' },
    ],
  },
  {
    key: 'reward',
    label: 'Reward',
    question: 'How much reward does it need for the risk?',
    options: [
      { value: 1.5, label: '1.5×', line: 'Takes more trades with closer targets.' },
      { value: 2, label: '2×', line: 'Twice the risk to the target.' },
      { value: 2.5, label: '2.5×', line: 'The house way.' },
      { value: 3, label: '3×', line: 'Only trades with lots of room above.' },
      { value: 4, label: '4×', line: 'Rare trades, big targets.' },
    ],
  },
  {
    key: 'hold',
    label: 'Hold',
    question: 'How long does it hold a trade?',
    options: [
      { value: 24, label: '1 day', line: 'Out within a day either way.' },
      { value: 72, label: '3 days', line: 'The house way.' },
      { value: 168, label: '1 week', line: 'Lets a move play out.' },
    ],
  },
  {
    key: 'trend',
    label: 'Trend',
    question: 'Does it stay out while the daily trend is falling?',
    options: [
      { value: true, label: 'Stay out', line: 'Waits for the daily trend to stop falling. The house way.' },
      { value: false, label: 'Trade it', line: 'Buys bounces even in a falling market.' },
    ],
  },
  {
    key: 'picky',
    label: 'Picky',
    question: 'How strong does a setup have to be?',
    options: [
      { value: 2, label: '2/5', line: 'Takes weaker setups too.' },
      { value: 3, label: '3/5', line: 'The house way.' },
      { value: 4, label: '4/5', line: 'Only strong setups.' },
      { value: 5, label: '5/5', line: 'Only its very best.' },
    ],
  },
]

const ALLOWED: { [K in keyof Blocks]: readonly Blocks[K][] } = {
  entry: ['at', 'close', 'near'],
  stop: ['tight', 'normal', 'wide'],
  reward: [1.5, 2, 2.5, 3, 4],
  hold: [24, 72, 168],
  trend: [true, false],
  picky: [2, 3, 4, 5],
}

/** Blocks from untrusted input (a request, a model's answer), or null if any value is off the list. */
export function validBlocks(x: unknown): Blocks | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const out = {} as Record<string, unknown>
  for (const key of Object.keys(ALLOWED) as (keyof Blocks)[]) {
    const v = o[key]
    if (!(ALLOWED[key] as readonly unknown[]).includes(v)) return null
    out[key] = v
  }
  return out as Blocks
}

/** The blocks in a fixed order, so the same strategy always hashes the same. */
export const canonical = (b: Blocks) => JSON.stringify({ entry: b.entry, stop: b.stop, reward: b.reward, hold: b.hold, trend: b.trend, picky: b.picky })

export const sameBlocks = (a: Blocks, b: Blocks) => canonical(a) === canonical(b)

/** What makes a strategy different from the house one, as short chips. */
export function traits(b: Blocks): string[] {
  const out: string[] = []
  for (const def of BLOCK_DEFS) {
    const v = b[def.key]
    if (v === HOUSE[def.key]) continue
    const opt = (def.options as Option<unknown>[]).find(o => o.value === v)
    if (opt) out.push(def.key === 'trend' ? (v ? 'Stays out of falling markets' : 'Trades falling markets') : `${def.label}: ${opt.label}`)
  }
  return out.length ? out : ['The house settings']
}

/** The message a member signs to change their agent's strategy. Fresh for five minutes, for this account only. */
export type StrategyIntent = { app: 'parallaxpay'; action: 'mine' | 'save' | 'hire' | 'teach'; account: string; at: number; strategy?: string; blocks?: Blocks; name?: string; publish?: boolean; words?: string }

/** Every setting of a strategy in plain words: for the house method, and for a strategy once you hire it. */
export function describe(b: Blocks): string[] {
  return [
    { at: 'Buys right at the level', close: 'Buys close to the level', near: 'Buys near the level' }[b.entry],
    { tight: 'Tight stop', normal: 'Stop under the level’s usual swing', wide: 'Wide stop' }[b.stop],
    `Needs ${b.reward}× the risk`,
    { 24: 'Holds up to a day', 72: 'Holds up to 3 days', 168: 'Holds up to a week' }[b.hold],
    b.trend ? 'Stays out of falling markets' : 'Trades falling markets',
    `Setups ${b.picky}/5 and up`,
  ]
}
