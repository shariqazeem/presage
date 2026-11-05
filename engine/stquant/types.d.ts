// Shared shapes for the ST Quant port's declaration files.
export type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number }
export type Frames = { d1: Candle[]; h4: Candle[]; h1: Candle[]; m15: Candle[]; m5?: Candle[] }
export type Line = {
  slope: number
  touches: number
  /** Indexes of the swing points that sit on the line, oldest first. */
  touchIdx: number[]
  startIdx: number
  valueAt: (i: number) => number
  direction: 'rising' | 'falling' | 'flat'
}
export type Level = {
  price: number
  /** The lowest and highest swing in the level: its thickness. */
  lo: number
  hi: number
  touches: number
  highs: number
  lows: number
  /** Touched from above and below: support that was resistance, or the reverse. */
  flipped: boolean
  /** Index of its first and last touch. */
  first: number
  last: number
  lastTouch: number
  points: { i: number; price: number; side: 'high' | 'low' }[]
  /** Where it is relative to the last close. */
  role: 'support' | 'resistance'
  /** The last close is inside the level. */
  at: boolean
}
export type Zone = Level
export type MfiExtreme = { value: number; percentile: number; isExtreme: boolean; min: number; turningUp: boolean }
export type KeySupport = {
  type: 'horizontal' | 'trendline-rising' | 'trendline-falling' | 'trendline-flat' | 'pattern-apex'
  price: number
  strength: number
}
export type PatternLevel = {
  tf: string
  weight: number
  kind: string
  price: number
  touches: number
  restShare?: number
  confirms: number
  distPct: number
  score: number
  confirmed: boolean
  all: Omit<PatternLevel, 'confirmed' | 'all'>[]
}
export type Rejection = { tf: string; kind: string; price: number; touches: number; distPct: number; dropPct?: number; rallyPct?: number }
