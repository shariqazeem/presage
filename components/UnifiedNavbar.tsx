'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WalletButton } from './WalletButton'
import { cx } from './ui'

const LINKS = [
  { href: '/floor', key: 'floor', label: 'Floor', live: true },
  { href: '/oracle', key: 'oracle', label: 'Oracle' },
  { href: '/agents/st-quant', key: 'st-quant', label: 'ST Quant' },
  { href: '/agents', key: 'agents', label: 'Agents' },
  { href: '/build', key: 'build', label: 'Build' },
  { href: '/record', key: 'record', label: 'Record' },
]

export function PresageLogo({ size = 48 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/presage-mark.svg" alt="Presage" width={size} height={size} style={{ width: size, height: size }} />
}

export function UnifiedNavbar({ currentPage }: { currentPage?: string }) {
  const path = usePathname()
  const active = (l: (typeof LINKS)[number]) => currentPage === l.key || (!currentPage && (path === l.href || (l.key === 'agents' && path?.startsWith('/agents/') && path !== '/agents/st-quant')))
  return (
    <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 lg:gap-10 min-w-0">
            <Link href="/" className="shrink-0">
              <motion.div whileHover={{ scale: 1.02 }} className="flex items-center gap-3 cursor-pointer">
                <PresageLogo size={38} />
                <span className="text-2xl font-bold text-black font-heading tracking-tight">Presage</span>
              </motion.div>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {LINKS.map(l => (
                <Link key={l.key} href={l.href} className={cx('px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2', active(l) ? 'text-black font-bold bg-gray-100' : 'font-medium text-gray-700 hover:text-black hover:bg-gray-50')}>
                  {l.live && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {currentPage === 'agents' && (
              <Link href="/build" className="hidden sm:flex">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-all">+ Deploy Agent</button>
              </Link>
            )}
            <WalletButton />
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-1 pt-2 -mx-1 overflow-x-auto [scrollbar-width:none]">
          {LINKS.map(l => (
            <Link key={l.key} href={l.href} className={cx('px-3 py-1.5 rounded-lg text-sm whitespace-nowrap', active(l) ? 'text-black font-bold bg-gray-100' : 'text-gray-600')}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </motion.header>
  )
}
