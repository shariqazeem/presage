import { ORACLE_ASSETS } from './oracle-assets'

export type Horizon = '1h' | '4h' | '24h'

/**
 * How far ahead the Oracle calls, and how small a move counts as flat. The band grows with the
 * horizon because longer windows carry more noise. `graceSec` is the time allowed to reveal after the
 * horizon ends; past it, anyone can forfeit the call and the payer is refunded.
 */
export const HORIZONS: Record<Horizon, { seconds: number; flatBandBps: number; graceSec: number; label: string }> = {
  '1h': { seconds: 3_600, flatBandBps: 10, graceSec: 2 * 3_600, label: '1 hour' },
  '4h': { seconds: 14_400, flatBandBps: 20, graceSec: 3 * 3_600, label: '4 hours' },
  '24h': { seconds: 86_400, flatBandBps: 40, graceSec: 6 * 3_600, label: '24 hours' },
}

export const isHorizon = (h: string): h is Horizon => h in HORIZONS

/** $0.05 per call, set by the founder on 14 Oct 2026. The contract holds the live price. */
export const ORACLE_CALL_PRICE_USD6 = 50_000

export const ORACLE_SYMBOLS = new Set(ORACLE_ASSETS.map(a => a.symbol))

export function oracleMarket(symbol: string): string | null {
  return ORACLE_ASSETS.find(a => a.symbol === symbol)?.market ?? null
}
