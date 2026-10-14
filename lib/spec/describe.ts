import { ORACLE_ASSETS } from '../oracle-assets'
import type { Condition, LevelRef, StrategySpec } from './schema'

const TF_WORD: Record<string, string> = { '15m': '15-minute', '1h': '1-hour', '4h': '4-hour', '1d': 'daily' }

export function describeLevel(l: LevelRef): string {
  switch (l.kind) {
    case 'support': {
      const type =
        l.type === 'any'
          ? 'support'
          : l.type === 'horizontal'
            ? 'horizontal support'
            : l.type === 'pattern-apex'
              ? 'wedge or triangle support'
              : `${l.type === 'trendline-rising' ? 'rising' : 'falling'} trendline support`
      return `the nearest ${TF_WORD[l.tf]} ${type} at or below price`
    }
    case 'patternSupport':
      return 'the pattern support confirmed across the higher timeframes'
    case 'firstRejection':
      return 'the first rejection point (the high of the biggest recent 4-hour pump candle, at most 30% up)'
    case 'nearestResistance':
      return 'the nearest level above price that has rejected it before'
    case 'recentLow':
      return `the lowest low of the last ${l.bars} ${TF_WORD[l.tf]} candles`
    case 'recentHigh':
      return `the highest high of the last ${l.bars} ${TF_WORD[l.tf]} candles`
  }
}

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'mfi':
      return `${TF_WORD[c.tf]} MFI is ${c.op === '<=' ? 'at or below' : 'at or above'} ${c.value}`
    case 'mfiPercentile':
      return c.op === '<='
        ? `${TF_WORD[c.tf]} MFI is in the lowest ${Math.round(c.value * 100)}% of its last 100 readings`
        : `${TF_WORD[c.tf]} MFI is in the highest ${Math.round((1 - c.value) * 100)}% of its last 100 readings`
    case 'mfiTurningUp':
      return `${TF_WORD[c.tf]} MFI has just turned up`
    case 'nearLevel':
      return `price is at, or no more than ${c.withinPct}% above, ${describeLevel(c.level)}`
    case 'trend':
      return `the ${TF_WORD[c.tf]} trend is ${c.dir} (20-candle average ${c.dir === 'up' ? 'above' : 'below'} the 50-candle average)`
    case 'priceVsEma':
      return `price is ${c.op} the ${TF_WORD[c.tf]} ${c.period}-candle average`
    case 'bullishDivergence':
      return `${TF_WORD[c.tf]} bullish divergence: price made a lower low while MFI made a higher low`
    case 'volumeSpike':
      return `the last ${TF_WORD[c.tf]} candle traded at least ${c.mult}× its 20-candle average volume`
    case 'change':
      return `price ${c.pct >= 0 ? 'rose' : 'fell'} ${c.op === '>=' ? 'at least' : 'at most'} ${Math.abs(c.pct)}% over the last ${c.bars} ${TF_WORD[c.tf]} candles`
    case 'minVolatility':
      return `the ${TF_WORD[c.tf]} chart moves at least ${c.atrPct}% per candle on average (ATR)`
  }
}

/** The rules a creator confirms before an agent goes live, in plain words. */
export function describeSpec(s: StrategySpec): { markets: string; rules: string[] } {
  const names = s.markets.map(m => ORACLE_ASSETS.find(a => a.market === m)?.symbol ?? m)
  const rules: string[] = []
  rules.push(`Looks for a long setup when all of these are true: ${s.when.map(describeCondition).join('; ')}.`)
  rules.push(
    s.entry.type === 'market'
      ? 'Enters at the market price the moment the conditions line up.'
      : `Rests a buy ${s.entry.abovePct}% above ${describeLevel(s.entry.level)}, valid for ${s.fillWindowHours} hours.`,
  )
  rules.push(
    s.stop.type === 'belowLevel'
      ? `Stop ${s.stop.pct}% below ${describeLevel(s.stop.level)}.`
      : s.stop.type === 'atr'
        ? `Stop ${s.stop.mult}× the ${TF_WORD[s.stop.tf]} ATR below the entry.`
        : `Stop ${s.stop.pct}% below the entry.`,
  )
  rules.push(
    s.target.type === 'level'
      ? `Target ${describeLevel(s.target.level)}.`
      : s.target.type === 'r'
        ? `Target ${s.target.multiple}× the risk above the entry.`
        : `Target ${s.target.pct}% above the entry.`,
  )
  rules.push(`Skips any setup that offers less than ${s.minRR}R to the target.`)
  rules.push(`Closes a filled setup after ${s.maxHoldHours} hours if neither stop nor target is hit, and waits ${s.cooldownHours} hours before calling the same coin again.`)
  return { markets: names.join(', '), rules }
}
