'use client'

import { ReactNode, useState } from 'react'
import { WagmiProvider, fallback, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit'
import {
  bitgetWallet,
  coinbaseWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { chain, rpcUrls } from '@/lib/chain'
import '@rainbow-me/rainbowkit/styles.css'

const config = getDefaultConfig({
  appName: 'Called',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'called-local',
  chains: [chain],
  transports: { [chain.id]: fallback(rpcUrls.map(url => http(url))) },
  wallets: [
    { groupName: 'Popular on Metis', wallets: [metaMaskWallet, okxWallet, rabbyWallet, bitgetWallet] },
    { groupName: 'More', wallets: [coinbaseWallet, walletConnectWallet] },
  ],
  ssr: true,
})

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } }))
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={chain}
          theme={lightTheme({ accentColor: '#000000', accentColorForeground: '#ffffff', borderRadius: 'large', fontStack: 'system' })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
