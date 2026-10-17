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
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-100 pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="grid grid-cols-5 h-[62px]">
        {TABS.map(item => {
          const active = item.match(path)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={cx('relative flex flex-col items-center justify-center gap-1 transition-colors', active ? 'text-black' : 'text-gray-400 active:text-gray-600')}>
              {active && <motion.span layoutId="tab-dot" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icon size={23} weight={active ? 2.3 : 2} />
              <span className={cx('text-[10.5px] leading-none', active ? 'font-black' : 'font-bold')}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
