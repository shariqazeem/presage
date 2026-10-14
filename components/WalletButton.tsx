'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

/** ParallaxPay's black wallet button, now for Metis wallets. */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && account && chain
        const base = `bg-black text-white rounded-lg ${compact ? 'px-4 py-2' : 'px-4 sm:px-6 py-2.5'} text-sm font-semibold hover:bg-gray-800 transition-all duration-200`
        if (!ready) return <div className="h-10 w-32" aria-hidden />
        if (!connected) {
          return (
            <button onClick={openConnectModal} className={base}>
              Connect Wallet
            </button>
          )
        }
        if (chain.unsupported) {
          return (
            <button onClick={openChainModal} className="bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-red-700 transition-all">
              Switch to Metis
            </button>
          )
        }
        return (
          <button onClick={openAccountModal} className={`${base} flex items-center gap-2`}>
            <span className="w-2 h-2 rounded-full bg-green-400" />
            {account.displayName}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}
