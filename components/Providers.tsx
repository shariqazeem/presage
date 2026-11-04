'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AgentState } from '@/lib/near/hooks'
import type { Candle } from '@/lib/market/types'
import { NearWalletProvider } from './near/NearWallet'

export type Seed = { agent: AgentState | null; candles: { coin: string; tf: string; candles: Candle[] } | null }

/** One query cache for the app, seeded with what the server already had so nothing loads twice. */
export function Providers({ children, seed }: { children: ReactNode; seed?: Seed }) {
  const [queryClient] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } })
    if (seed?.agent) qc.setQueryData(['near-agent'], seed.agent)
    if (seed?.candles) qc.setQueryData(['near-candles', seed.candles.coin, seed.candles.tf], seed.candles.candles)
    return qc
  })
  return (
    <QueryClientProvider client={queryClient}>
      <NearWalletProvider>{children}</NearWalletProvider>
    </QueryClientProvider>
  )
}
