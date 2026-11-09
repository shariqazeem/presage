'use client'

import { useQuery } from '@tanstack/react-query'
import type { FeedLine, PositionView } from './store'
import type { Member } from './vault'

const json = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `${r.status}`)
  return r.json()
}

export type CoinRead = {
  coin: string
  token: string
  at: number
  price: number
  mfi15: number | null
  mfi15Pct: number | null
  mfi1h: number | null
  mfi1hPct: number | null
  support: { price: number; tf: string; kind: string } | null
  supportDistPct: number | null
  armedAt: number | null
  setup: { route: string; stop: number; target: number; r1: number | null; conviction: number; rr: number; reasons: string[] } | null
  blocker: string | null
  levels?: { support: number | null; r1: number | null; r2: number | null }
  spark?: number[]
  change24h?: number | null
  checks?: { key: string; label: string; ok: boolean | null; note: string }[]
  line: string
}

export type RecordStats = { closed: number; wins: number; pnlUsd: number; avgPct: number | null }

export type AgentState = {
  nextCheckAt: number
  reads: CoinRead[]
  feed: FeedLine[]
  record: RecordStats
  vault: { members: number; trades: number; calls: number; paused: boolean } | null
}

export const useAgentState = () => useQuery({ queryKey: ['near-agent'], queryFn: () => json<AgentState>('/api/near/agent'), refetchInterval: 20_000 })

export type Desk = { account: string; member: Member | null; reachable: boolean; positions: PositionView[]; feed: FeedLine[] }

export const useDesk = (account: string | null) =>
  useQuery({ queryKey: ['near-desk', account], queryFn: () => json<Desk>(`/api/near/desk?account=${encodeURIComponent(account!)}`), enabled: Boolean(account), refetchInterval: 15_000 })

export const useTrades = () => useQuery({ queryKey: ['near-trades'], queryFn: () => json<{ trades: PositionView[]; stats: RecordStats }>('/api/near/trades'), refetchInterval: 30_000 })

export const useTrade = (id: number) => useQuery({ queryKey: ['near-trade', id], queryFn: () => json<{ trade: PositionView }>(`/api/near/trades/${id}`), refetchInterval: 30_000 })

/** Live prices from the Rhea pools it trades, every few seconds while the page is in front of someone. */
export const useLivePrices = () =>
  useQuery({
    queryKey: ['near-live'],
    queryFn: () => json<{ at: number; prices: Record<string, number> }>('/api/near/live'),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 4_000,
  })

/** One coin's live price, or null until the first one arrives. */
export function useLivePrice(symbol: string | undefined | null): number | null {
  const { data } = useLivePrices()
  return (symbol && data?.prices?.[symbol]) || null
}

let tabId: string | null = null

/** How many people have ParallaxPay open right now (this tab included). */
export const usePresence = () =>
  useQuery({
    queryKey: ['near-presence'],
    queryFn: async () => {
      tabId ??= Math.random().toString(36).slice(2, 14)
      const r = await fetch('/api/near/presence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: tabId }) })
      return ((await r.json()) as { here: number }).here
    },
    refetchInterval: 25_000,
  })

export type BoardRecord = { trades: number; wins: number; avgPct: number | null; pnlUsd: number; open: number; members: number; lastAt: number | null }
export type BoardRow = { id: string; name: string; owner: string | null; house: boolean; adopted: boolean; createdAt: number; record: BoardRecord; ranked: boolean; traits: string[] | null }

/** The board: strategies ranked by their real, sealed trades. */
export const useBoard = () => useQuery({ queryKey: ['near-board'], queryFn: () => json<{ strategies: BoardRow[]; minRanked: number }>('/api/near/strategies'), refetchInterval: 60_000 })

/** One strategy on the board, with its trades. */
export const useBoardStrategy = (id: string) =>
  useQuery({ queryKey: ['near-board', id], queryFn: () => json<{ strategy: Omit<BoardRow, 'record' | 'ranked'> & { hash: string }; record: BoardRecord; trades: PositionView[] }>(`/api/near/strategies/${encodeURIComponent(id)}`), refetchInterval: 60_000 })
