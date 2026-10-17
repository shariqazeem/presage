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
    <header className="hidden md:block sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-line">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <Mark size={34} className="transition-transform group-hover:rotate-[-6deg]" />
          <span className="font-heading text-[23px] font-black tight text-ink">Called</span>
        </Link>
        <nav className="flex items-center gap-1">
          {DESKTOP.map(item => {
            const active = item.match(path)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={cx('relative h-16 px-3.5 text-[15px] flex items-center gap-2 transition-colors', active ? 'text-ink font-semibold' : 'text-ink-3 font-medium hover:text-ink')}>
                {active && <motion.span layoutId="topnav-line" className="absolute left-3 right-3 -bottom-px h-[2.5px] rounded-full foil-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon size={17} />
                <span>{item.label}</span>
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
