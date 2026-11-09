import { USDC } from './config'
import type { CoinRead } from './hooks'
import { ranked } from './rank'
import { fromUnits } from './units'
import { STYLE_SHARE, allowsCoin, type Rules } from './vault'

/**
 * Hiring before funding: a mandate written in the app is kept on this device, and the agent shows what
 * it would do with it right now, from its live reads, until it's funded and signed on NEAR.
 */

const RULES_KEY = 'parallaxpay_rules'
const WATCHING_KEY = 'parallaxpay_watching'

/** What the agent would do for a mandate this minute. */
export type WouldDo =
  /** A setup the mandate's style takes: the size it would buy. */
  | { kind: 'buy'; read: CoinRead; usd: number }
  /** A setup, but graded below what the mandate's style waits for. */
  | { kind: 'pass'; read: CoinRead; grade: number }
  /** No setup yet: the closest coin, and the checks it still needs. */
  | { kind: 'wait'; read: CoinRead; missing: string[] }
  | { kind: 'none' }

export function wouldDo(rules: Rules, reads: CoinRead[]): WouldDo {
  const mine = ranked(reads.filter(r => allowsCoin(rules, r.token)))
  const largest = fromUnits(rules.max_trade, USDC.decimals)
  let passed: WouldDo | null = null
  for (const r of mine) {
    if (!r.setup) continue
    const share = STYLE_SHARE[rules.style]?.[r.setup.conviction]
    if (share != null) return { kind: 'buy', read: r, usd: Math.max(1, Math.round(largest * share * 100) / 100) }
    passed ??= { kind: 'pass', read: r, grade: r.setup.conviction }
  }
  if (passed) return passed
  const lead = mine[0]
  if (!lead) return { kind: 'none' }
  return { kind: 'wait', read: lead, missing: (lead.checks ?? []).filter(c => c.ok === false).map(c => c.label) }
}

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows can refuse storage; the app still works for this visit.
  }
}

/** The mandate written on this device, finished or not. */
export const savedRules = () => read<Rules>(RULES_KEY)
export const saveRules = (rules: Rules) => write(RULES_KEY, rules)

/** Whether someone finished a mandate here and asked the agent to start watching for them. */
export const watching = () => read<number>(WATCHING_KEY) != null
export function startWatching(rules: Rules) {
  saveRules(rules)
  write(WATCHING_KEY, Date.now())
}
/** Once the mandate is signed on NEAR, the vault holds it and the device copy is only a draft. */
export const stopWatching = () => write(WATCHING_KEY, null)
