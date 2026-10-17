'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { cx } from '../ui'
import { TABS } from './nav'

/** The phone tab bar: Today, Oracle, ST Quant, Agents, You. */
export function TabBar() {
  const path = usePathname() ?? '/'
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="grid grid-cols-5 h-[62px]">
        {TABS.map(item => {
          const active = item.match(path)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={cx('relative flex flex-col items-center justify-center gap-1 transition-colors', active ? 'text-ink' : 'text-[#A1A1AA] active:text-ink-3')}>
              {active && <motion.span layoutId="tab-dot" className="absolute top-0 h-[2.5px] w-7 rounded-b-full foil-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icon size={23} weight={active ? 2.2 : 1.9} />
              <span className={cx('text-[10.5px] leading-none', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
