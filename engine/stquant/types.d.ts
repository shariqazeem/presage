// Shared shapes for the ST Quant port's declaration files.
export type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number }
export type Frames = { d1: Candle[]; h4: Candle[]; h1: Candle[]; m15: Candle[]; m5?: Candle[] }
export type Line = {
  slope: number
  touches: number
  startIdx: number
  valueAt: (i: number) => number
  direction: 'rising' | 'falling' | 'flat'
}
export type Zone = { price: number; touches: number; lastTouch: number }
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
