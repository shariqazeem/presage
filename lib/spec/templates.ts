import type { StrategySpec } from './schema'

/** Starting points that need no model. The first is ST Quant's core idea, in Presage's vocabulary. */
export const TEMPLATES: { id: string; name: string; prompt: string; spec: Omit<StrategySpec, 'markets'> }[] = [
  {
    id: 'mfi-trendline',
    name: 'MFI bottom at a rising trendline',
    prompt:
      'Buy when 15-minute MFI is at its lowest at a rising 4-hour trendline. Stop 2% below the line, target the first rejection point.',
    spec: {
      v: 1,
      kind: 'setup',
      side: 'long',
      when: [
        { kind: 'mfiPercentile', tf: '15m', op: '<=', value: 0.1 },
        { kind: 'nearLevel', level: { kind: 'support', tf: '4h', type: 'trendline-rising' }, withinPct: 2 },
      ],
      entry: { type: 'market' },
      stop: { type: 'belowLevel', level: { kind: 'support', tf: '4h', type: 'trendline-rising' }, pct: 2 },
      target: { type: 'level', level: { kind: 'firstRejection' } },
      minRR: 1.5,
      fillWindowHours: 24,
      maxHoldHours: 48,
      cooldownHours: 6,
    },
  },
  {
    id: 'dip-in-uptrend',
    name: 'Dip in an uptrend',
    prompt: 'In a 4-hour uptrend, buy when 1-hour MFI drops below 25 near 1-hour support. Stop 1.5× ATR, target 2R.',
    spec: {
      v: 1,
      kind: 'setup',
      side: 'long',
      when: [
        { kind: 'trend', tf: '4h', dir: 'up' },
        { kind: 'mfi', tf: '1h', op: '<=', value: 25 },
        { kind: 'nearLevel', level: { kind: 'support', tf: '1h', type: 'any' }, withinPct: 1.5 },
      ],
      entry: { type: 'market' },
      stop: { type: 'atr', tf: '1h', mult: 1.5 },
      target: { type: 'r', multiple: 2 },
      minRR: 1.5,
      fillWindowHours: 12,
      maxHoldHours: 36,
      cooldownHours: 8,
    },
  },
  {
    id: 'divergence-reversal',
    name: 'Divergence at pattern support',
    prompt: 'Buy a 1-hour bullish MFI divergence at the confirmed pattern support. Stop 3% under it, target the nearest resistance.',
    spec: {
      v: 1,
      kind: 'setup',
      side: 'long',
      when: [
        { kind: 'bullishDivergence', tf: '1h' },
        { kind: 'nearLevel', level: { kind: 'patternSupport' }, withinPct: 2.5 },
      ],
      entry: { type: 'market' },
      stop: { type: 'belowLevel', level: { kind: 'patternSupport' }, pct: 3 },
      target: { type: 'level', level: { kind: 'nearestResistance' } },
      minRR: 1.5,
      fillWindowHours: 24,
      maxHoldHours: 72,
      cooldownHours: 12,
    },
  },
]
