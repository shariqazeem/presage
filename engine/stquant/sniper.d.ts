import type { Candle, Frames, KeySupport, MfiExtreme } from './types'
export const SNIPER: Record<string, number | boolean>
export function mfiExtreme(candles: Candle[], lookback?: number): MfiExtreme | null
export function keySupports(candles: Candle[]): KeySupport[]
export function supportMap(frames: Frames): Record<'1D' | '4H' | '1H' | '15m', KeySupport[]>
export type SniperFire = {
  fire: boolean
  score: number
  notes: string[]
  divergence: { m15: boolean; h1: boolean }
  mfi15: MfiExtreme
  mfi1h: MfiExtreme | null
  supports: (KeySupport & { tf: string; distPct: number })[]
  supportMap: Record<string, KeySupport[]>
  price: number
  stop: number
  reason?: string
}
export function sniperSignal(frames: Frames): SniperFire | { fire: false; reason: string }
