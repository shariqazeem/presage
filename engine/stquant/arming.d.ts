import type { Frames } from './types'
export const ARM: Record<string, unknown> & { minRR: number; minStopPct: number }
export type ArmPlan = {
  entryType: 'market' | 'limit'
  arm: boolean
  conviction: number
  supportPrice: number
  triggerPrice: number
  stop: number
  tp1: number
  rr: number
  level: { tf: string; type: string; price: number; strength: number; dist: number; confluence: number; structural: boolean }
  reasons: string[]
  blockers: string[]
  price: number
}
export function armPlan(frames: Frames, token?: unknown): ArmPlan | { arm: false; blockers: string[] }
export function firstRejection(frames: Frames, price: number): number | null
export function nearestRejector(frames: Frames, price: number): { price: number; touches: number; kind: string } | null
export function isStructural(level: { price: number }, frames: Frames, tolerance?: number): { ok: boolean; confirmedOn?: string; touches?: number }
export function higherTfQuality(frames: Frames): { score: number; notes: string[]; strong: boolean; weak: boolean }
