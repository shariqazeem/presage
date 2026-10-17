import { TF_MS, type Candle } from '../market/types'
import type { DirectionPayload, SetupPayload } from './payload'

/**
 * How a call's outcome is decided. These functions are the whole rulebook: the engine uses them to
 * resolve calls and the receipt page runs the same code, so anyone can re-check an outcome against
 * public candles. Every rule leans against the agent when the candles are ambiguous.
 */

export type Outcome = 'win' | 'loss' | 'flat' | 'nofill'

export type Resolution = {
  outcome: Outcome
  /** Setup calls: hundredths of R. Direction calls: basis points of return in the called direction. */
  result: number
  detail: {
    filledAt?: number
    fillPrice?: number
    exitAt?: number
    exitPrice?: number
    reason: string
  }
}

export const SETUP_RULES = [
  'Only 15-minute candles that open after the call was sealed on chain count.',
  'A limit entry fills when a candle trades at or below the entry price. A market entry fills at the price recorded when the call was issued.',
  'After the fill, the first candle that reaches the stop ends the call as a loss of 1R.',
  'If one candle reaches both the stop and the target, it counts as a loss.',
  'The first candle that reaches the target ends the call as a win, at the target.',
  'If neither happens within the hold window, the call closes at that candle’s close and is marked flat, with whatever R it made or lost.',
  'If the entry never fills before the fill deadline, the call is marked no-fill (0R).',
]

export const DIRECTION_RULES = [
  'The call is measured from the price recorded when it was issued to the 1-minute close at the end of its horizon.',
  'A move in the called direction larger than the flat band is a win. A move the other way larger than the band is a loss.',
  'A move inside the band is flat: neither right nor wrong.',
  'The result is the return in the called direction, in basis points.',
]

const r100 = (exit: number, entry: number, risk: number) => Math.round(((exit - entry) / risk) * 100)

/**
 * Resolve a long setup from 15-minute candles. `sealedAt` is the block time of the seal transaction.
 * Returns null while the outcome is still open.
 */
export function resolveSetup(p: SetupPayload, candles: Candle[], sealedAt: number, now: number): Resolution | null {
  const tf = TF_MS['15m']
  const start = sealedAt * 1000
  const usable = candles
    .filter(k => k.ts >= start && k.ts + tf <= now * 1000)
    .sort((a, b) => a.ts - b.ts)

  const entry = p.entry.type === 'market' ? p.priceAtIssue : p.entry.price
  const risk = entry - p.stop
  if (!(risk > 0) || !(p.target > entry)) {
    return { outcome: 'loss', result: -100, detail: { reason: 'Malformed setup: the stop or target is on the wrong side of the entry.' } }
  }

  let filledAt: number | null = p.entry.type === 'market' ? sealedAt : null
  for (const k of usable) {
    const closeAt = (k.ts + tf) / 1000
    if (filledAt === null) {
      if (k.ts / 1000 >= p.fillBy) {
        return { outcome: 'nofill', result: 0, detail: { reason: 'The entry was never reached before the fill deadline.' } }
      }
      if (k.l <= entry) {
        filledAt = k.ts / 1000
        if (k.l <= p.stop) {
          return {
            outcome: 'loss',
            result: -100,
            detail: { filledAt, fillPrice: entry, exitAt: closeAt, exitPrice: p.stop, reason: 'Filled and stopped out in the same candle.' },
          }
        }
        // A target touched in the fill candle may have come before the fill, so it is ignored.
      }
      continue
    }
    if (k.l <= p.stop) {
      const both = k.h >= p.target
      return {
        outcome: 'loss',
        result: -100,
        detail: {
          filledAt,
          fillPrice: entry,
          exitAt: closeAt,
          exitPrice: p.stop,
          reason: both ? 'One candle reached both the stop and the target; that counts as a loss.' : 'The stop was reached.',
        },
      }
    }
    if (k.h >= p.target) {
      return {
        outcome: 'win',
        result: r100(p.target, entry, risk),
        detail: { filledAt, fillPrice: entry, exitAt: closeAt, exitPrice: p.target, reason: 'The target was reached.' },
      }
    }
    if (closeAt >= filledAt + p.maxHoldSec) {
      return {
        outcome: 'flat',
        result: r100(k.c, entry, risk),
        detail: { filledAt, fillPrice: entry, exitAt: closeAt, exitPrice: k.c, reason: 'Neither stop nor target within the hold window; closed at the candle close.' },
      }
    }
  }

  if (filledAt === null && now >= p.fillBy && usable.length && usable.at(-1)!.ts + tf >= p.fillBy * 1000) {
    return { outcome: 'nofill', result: 0, detail: { reason: 'The entry was never reached before the fill deadline.' } }
  }
  return null
}

/** Resolve a direction call from the 1-minute close at the end of its horizon. */
export function resolveDirection(p: DirectionPayload, closeAtHorizon: number): Resolution {
  const moveBps = ((closeAtHorizon - p.priceAtIssue) / p.priceAtIssue) * 10_000
  const signed = Math.round(p.direction === 'up' ? moveBps : -moveBps)
  const outcome: Outcome = signed > p.flatBandBps ? 'win' : signed < -p.flatBandBps ? 'loss' : 'flat'
  const pct = (Math.abs(moveBps) / 100).toFixed(2)
  return {
    outcome,
    result: signed,
    detail: {
      exitAt: p.issuedAt + p.horizonSec,
      exitPrice: closeAtHorizon,
      reason:
        outcome === 'flat'
          ? `Moved ${pct}%, inside the ±${(p.flatBandBps / 100).toFixed(2)}% flat band.`
          : `Moved ${moveBps >= 0 ? 'up' : 'down'} ${pct}% on a call of ${p.direction}.`,
    },
  }
}

/** When a call can first be resolved, so the engine knows when to look. */
export function earliestResolution(p: SetupPayload | DirectionPayload): number {
  return p.rules === 'called/direction-v1' ? p.issuedAt + p.horizonSec + 60 : p.issuedAt + 15 * 60
}
