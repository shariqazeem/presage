import type { Candle, Frames, Line, PatternLevel, Rejection, Zone } from './types'
export function supportZones(candles: Candle[], tol?: number): Zone[]
export function resistanceZones(candles: Candle[], tol?: number): Zone[]
export function shelves(candles: Candle[], opts?: { bins?: number; minSharePct?: number }): { price: number; share: number; bars: number }[]
export function fitBoundary(candles: Candle[], side?: 'lower' | 'upper', opts?: { tol?: number; minTouches?: number }): Line | null
export function patternSupport(frames: Frames, price: number): PatternLevel | null
export function patternResistance(frames: Frames, price: number): PatternLevel | null
export function patternTargets(frames: Frames, price: number): { r1: Rejection | null; r2: Rejection | null; all: Rejection[] }
