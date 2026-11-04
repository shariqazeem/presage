'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AgentState } from '@/lib/near/hooks'
import type { Candle } from '@/lib/market/types'
import { RenderedAt } from './kit'
import { NearWalletProvider } from './near/NearWallet'

/** `draw` holds each coin's 1H candles for the agent's drawings, keyed by symbol. */
export type Seed = { now: number; agent: AgentState | null; draw: Record<string, Candle[]> }

/** One query cache for the app, seeded with what the server already had so nothing loads twice. */
export function Providers({ children, seed }: { children: ReactNode; seed?: Seed }) {
  const [queryClient] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } })
    if (seed?.agent) qc.setQueryData(['near-agent'], seed.agent)
    for (const [coin, candles] of Object.entries(seed?.draw ?? {})) qc.setQueryData(['near-draw', coin, '1h'], candles)
    return qc
  })
  return (
    <RenderedAt.Provider value={seed?.now ?? null}>
      <QueryClientProvider client={queryClient}>
        <NearWalletProvider>{children}</NearWalletProvider>
      </QueryClientProvider>
    </RenderedAt.Provider>
  )
}
