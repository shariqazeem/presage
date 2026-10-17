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
        if (!mounted) return <div className={cx(variant === 'full' ? 'h-[54px] w-full' : 'h-10 w-28', 'rounded-[14px] bg-paper-2 animate-pulse')} aria-hidden />
        const size = variant === 'full' ? 'h-[54px] px-6 text-base w-full rounded-[14px]' : variant === 'chip' ? 'h-9 px-3.5 text-[13px] rounded-full' : 'h-10 px-4 text-sm rounded-[12px]'
        if (!account || !chain) {
          return (
            <button onClick={openConnectModal} className={cx('bg-ink text-white font-semibold hover:bg-[#26262A] active:scale-[0.98] transition-all', size, className)}>
              {variant === 'chip' ? 'Connect' : label}
            </button>
          )
        }
        if (chain.unsupported) {
          return (
            <button onClick={openChainModal} className={cx('bg-down text-white font-semibold transition-all', size, className)}>
              Switch to Metis
            </button>
          )
        }
        if (variant === 'full') return null
        return (
          <Link href="/you" className={cx('inline-flex items-center gap-2 bg-ink text-white font-semibold hover:bg-[#26262A] transition-all', size, className)}>
            <WalletAvatar address={account.address} size={variant === 'chip' ? 18 : 20} />
            <span className="num">{account.displayName}</span>
          </Link>
        )
      }}
    </ConnectButton.Custom>
  )
}
