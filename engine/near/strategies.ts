import type { Blocks } from '../../lib/near/strategy'
import { V2_DEFAULTS, type V2Params } from './strategy'

/**
 * A member's building blocks, as the v2 strategy's own settings. The house blocks give V2_DEFAULTS
 * exactly, so an agent on the house strategy trades as it always has.
 */
export function paramsFor(b: Blocks): V2Params {
  const entry = { at: { bandAbovePct: 0.003, bandBelowPct: 0.002 }, close: { bandAbovePct: 0.005, bandBelowPct: 0.003 }, near: { bandAbovePct: 0.01, bandBelowPct: 0.005 } }[b.entry]
  const stop = {
    tight: { stopAtrMult: 0.4, stopMinPct: 0.004, minStopDistPct: 0.005, maxStopPct: 0.03 },
    normal: { stopAtrMult: V2_DEFAULTS.stopAtrMult, stopMinPct: V2_DEFAULTS.stopMinPct, minStopDistPct: V2_DEFAULTS.minStopDistPct, maxStopPct: V2_DEFAULTS.maxStopPct },
    wide: { stopAtrMult: 1, stopMinPct: 0.01, minStopDistPct: 0.012, maxStopPct: 0.06 },
  }[b.stop]
  return {
    ...V2_DEFAULTS,
    ...entry,
    ...stop,
    minRR: b.reward,
    maxHoldHours: b.hold,
    // Trading falling markets drops the trend gate and armPlan's trend and momentum vetoes; the level's
    // own vetoes (too few touches, a broken line) always apply.
    regimeFilter: b.trend,
    planVetoes: b.trend ? V2_DEFAULTS.planVetoes : 'level',
    minConviction: b.picky,
  }
}
