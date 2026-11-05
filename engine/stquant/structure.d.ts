import type { Candle, Frames, Level, Line, PatternLevel, Rejection, Zone } from './types'
export function tolerances(candles: Candle[], cap?: number): { bar: number; touch: number; wick: number; body: number; level: number }
export function levels(candles: Candle[], opts?: { wing?: number }): Level[]
export function supportZones(candles: Candle[]): Zone[]
export function resistanceZones(candles: Candle[]): Zone[]
export function shelves(candles: Candle[], opts?: { bins?: number; minSharePct?: number }): { price: number; share: number; bars: number }[]
export function fitBoundary(candles: Candle[], side?: 'lower' | 'upper', opts?: { tol?: number; minTouches?: number; minGap?: number }): Line | null
export function patternSupport(frames: Frames, price: number): PatternLevel | null
export function patternResistance(frames: Frames, price: number): PatternLevel | null
export function patternTargets(frames: Frames, price: number): { r1: Rejection | null; r2: Rejection | null; all: Rejection[] }
