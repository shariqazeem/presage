import { CORE_SYMBOLS } from './config'
import type { CoinRead } from './hooks'

/** How close a read is to a trade: a setup beats an armed plan, which beats the most checks passed. */
export function closeness(r: Pick<CoinRead, 'setup' | 'armedAt' | 'checks'>): number {
  return (r.setup ? 100 : 0) + (r.armedAt ? 50 : 0) + (r.checks ?? []).filter(c => c.ok).length
}

/** Reads, closest to a trade first; ties go to the coins it started with, then alphabetically. */
export function ranked<T extends Pick<CoinRead, 'coin' | 'setup' | 'armedAt' | 'checks'>>(reads: T[]): T[] {
  const core = (c: string) => {
    const i = CORE_SYMBOLS.indexOf(c)
    return i < 0 ? 99 : i
  }
  return [...reads].sort((a, b) => closeness(b) - closeness(a) || core(a.coin) - core(b.coin) || a.coin.localeCompare(b.coin))
}
