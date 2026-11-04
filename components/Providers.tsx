'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NearWalletProvider } from './near/NearWallet'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } }))
  return (
    <QueryClientProvider client={queryClient}>
      <NearWalletProvider>{children}</NearWalletProvider>
    </QueryClientProvider>
  )
}
