import type { Candle } from './types'
export function mfi(candles: Candle[], period?: number): (number | null)[] | null
export function atr(candles: Candle[], period?: number): number | null
export function ema(candles: Candle[], period: number): number | null
export function sma(values: number[], period: number): number | null
export function swings(candles: Candle[], wing?: number): { highs: { i: number; ts: number; price: number }[]; lows: { i: number; ts: number; price: number }[] }
export function volumeSpike(candles: Candle[], mult?: number, lookback?: number): boolean
export function bullishReversal(candles: Candle[]): boolean
export function bullishDivergence(
  candles: Candle[],
  opts?: { lookback?: number; wing?: number; minGapBars?: number },
): { diverging: boolean; priceChangePct: number; mfiChange: number; barsAgo: number } | null
export function hugsLine(candle: Candle, line: number, opts?: { breakTolerance?: number }): { hugging: boolean; broken: boolean; closeVsLinePct: number } | null
export function ord(n: number): string
