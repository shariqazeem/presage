'use client'

import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { cx } from './ui'

/** A wallet's own colours, from its address, so the same wallet always looks the same. */
export function WalletAvatar({ address, size = 22 }: { address: string; size?: number }) {
  const h = parseInt(address.slice(2, 10), 16) || 0
  const a = h % 360
  const b = (a + 60 + ((h >> 9) % 120)) % 360
  return <span className="inline-block rounded-full shrink-0 ring-2 ring-white/70" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${a} 85% 60%), hsl(${b} 85% 55%))` }} />
}

type Variant = 'nav' | 'chip' | 'full'

/**
 * Connect, or once connected, a chip that opens your page. `full` is the big button used inside a
 * panel, where connecting is the next step of something you are doing.
 */
export function WalletButton({ variant = 'nav', label = 'Connect wallet', className = '' }: { variant?: Variant; label?: string; className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) return <div className={cx(variant === 'full' ? 'h-14 w-full' : 'h-10 w-28', 'rounded-xl bg-gray-100 animate-pulse')} aria-hidden />
        const size = variant === 'full' ? 'h-14 px-6 text-base w-full rounded-2xl' : variant === 'chip' ? 'h-9 px-3.5 text-[13px] rounded-full' : 'h-10 px-4 text-sm rounded-xl'
        if (!account || !chain) {
          return (
            <button onClick={openConnectModal} className={cx('bg-black text-white font-bold hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm', size, className)}>
              {variant === 'chip' ? 'Connect' : label}
            </button>
          )
        }
        if (chain.unsupported) {
          return (
            <button onClick={openChainModal} className={cx('bg-red-600 text-white font-bold hover:bg-red-700 transition-all', size, className)}>
              Switch to Metis
            </button>
          )
        }
        if (variant === 'full') return null
        return (
          <Link href="/you" className={cx('inline-flex items-center gap-2 bg-black text-white font-bold hover:bg-gray-800 transition-all', size, className)}>
            <WalletAvatar address={account.address} size={variant === 'chip' ? 18 : 20} />
            {account.displayName}
          </Link>
        )
      }}
    </ConnectButton.Custom>
  )
}
