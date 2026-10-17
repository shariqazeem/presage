'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { WalletButton } from '../WalletButton'
import { cx } from '../ui'
import { Mark } from './Mark'
import { DESKTOP } from './nav'

/** The desktop bar. Phones get the tab bar instead, and each page carries its own heading. */
export function TopNav() {
  const path = usePathname() ?? '/'
  return (
    <header className="hidden md:block sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <Mark size={34} className="transition-transform group-hover:rotate-[-6deg]" />
          <span className="font-heading text-[22px] font-black tracking-tight text-black">Presage</span>
        </Link>
        <nav className="flex items-center gap-1">
          {DESKTOP.map(item => {
            const active = item.match(path)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={cx('relative px-3.5 py-2 rounded-xl text-[15px] flex items-center gap-2 transition-colors', active ? 'text-black font-bold' : 'text-gray-500 font-semibold hover:text-black')}>
                {active && <motion.span layoutId="topnav-pill" className="absolute inset-0 rounded-xl bg-gray-100" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon size={17} className="relative" />
                <span className="relative">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <WalletButton variant="nav" />
        </div>
      </div>
    </header>
  )
}
