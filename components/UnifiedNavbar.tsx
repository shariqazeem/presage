'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { WalletButton } from './WalletButton'

const LINKS = [
  { href: '/oracle', key: 'oracle', label: 'Oracle' },
  { href: '/agents', key: 'agents', label: 'Agents' },
  { href: '/build', key: 'build', label: 'Build' },
  { href: '/record', key: 'record', label: 'Record' },
]

export function PresageLogo({ size = 48 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/presage-mark.svg" alt="Presage" width={size} height={size} style={{ width: size, height: size }} />
}

export function UnifiedNavbar({ currentPage }: { currentPage?: string }) {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 lg:gap-12">
            <Link href="/">
              <motion.div whileHover={{ scale: 1.02 }} className="flex items-center gap-3 cursor-pointer">
                <PresageLogo size={40} />
                <span className="text-2xl font-bold text-black font-heading">Presage</span>
              </motion.div>
            </Link>

            <nav className="hidden md:flex items-center gap-6 lg:gap-8">
              {LINKS.map(l => (
                <Link
                  key={l.key}
                  href={l.href}
                  className={`text-sm transition-colors ${
                    currentPage === l.key ? 'text-black font-bold' : 'font-medium text-gray-700 hover:text-black'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {currentPage === 'agents' && (
              <Link href="/build" className="hidden sm:flex">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-all">
                  + Deploy Agent
                </button>
              </Link>
            )}
            <WalletButton />
          </div>
        </div>

        <nav className="md:hidden flex items-center gap-5 pt-3 overflow-x-auto">
          {LINKS.map(l => (
            <Link
              key={l.key}
              href={l.href}
              className={`text-sm whitespace-nowrap ${currentPage === l.key ? 'text-black font-bold' : 'text-gray-600'}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </motion.header>
  )
}
