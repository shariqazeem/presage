'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import type { AgentSummary, CallView } from '../server/records'

const json = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `${r.status}`)
  return r.json()
}

export const useAgents = () => useQuery({ queryKey: ['agents'], queryFn: () => json<{ agents: AgentSummary[] }>('/api/agents'), refetchInterval: 30_000 })

export const useAgent = (slug: string) =>
  useQuery({
    queryKey: ['agent', slug],
    queryFn: () =>
      json<{ agent: AgentSummary; rules: { markets: string; rules: string[] } | null; spec: string | null; calls: CallView[]; viewer: string | null }>(
        `/api/agents/${slug}`,
      ),
    refetchInterval: 20_000,
  })

export const useFeed = () => useQuery({ queryKey: ['feed'], queryFn: () => json<{ calls: CallView[] }>('/api/feed'), refetchInterval: 15_000 })

export const useStats = () =>
  useQuery({
    queryKey: ['stats'],
    queryFn: () =>
      json<{ callsSealed: number; resolved: number; open: number; wins: number; losses: number; forfeited: number; paidCalls: number; agents: number; onChainEvents: number }>(
        '/api/stats',
      ),
    refetchInterval: 30_000,
  })

/** Wallet sign-in: one signature proves the wallet, so subscribers see sealed calls early. */
export function useSession() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['session'], queryFn: () => json<{ wallet: string | null }>('/api/session') })
  const signedIn = Boolean(address && q.data?.wallet && q.data.wallet === address.toLowerCase())
  const signIn = useCallback(async () => {
    if (!address) throw new Error('Connect a wallet first')
    const { message } = await json<{ message: string }>(`/api/session?address=${address}`)
    const signature = await signMessageAsync({ message })
    const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, message, signature }) })
    if (!r.ok) throw new Error((await r.json()).error)
    await qc.invalidateQueries()
  }, [address, signMessageAsync, qc])
  return { signedIn, wallet: q.data?.wallet ?? null, signIn }
}
