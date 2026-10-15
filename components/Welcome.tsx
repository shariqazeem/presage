'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { formatUnits } from 'viem'
import { useAccount, useBalance } from 'wagmi'
import { useTelegramLink } from '@/lib/client/hooks'
import { Button, Pill } from './ui'

/**
 * The first thing a connected wallet sees: where it is, what it can do, how to get METIS. Shown once per
 * wallet, dismissable, never in the way.
 */
export function Welcome() {
  const { address, isConnected } = useAccount()
  const { data: bal } = useBalance({ address, query: { enabled: Boolean(address) } })
  const [shown, setShown] = useState(false)
  const openTelegram = useTelegramLink()
  const key = `presage_welcome_${address?.toLowerCase()}`

  useEffect(() => {
    if (!isConnected || !address) return setShown(false)
    try {
      setShown(!localStorage.getItem(key))
    } catch {
      setShown(true)
    }
  }, [isConnected, address, key])

  const dismiss = () => {
    try {
      localStorage.setItem(key, '1')
    } catch {}
    setShown(false)
  }
  const metis = bal ? Number(formatUnits(bal.value, bal.decimals)) : null

  return (
    <AnimatePresence>
      {shown && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-6 rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-black text-black">You’re on the floor</h3>
                <Pill tone="black">Metis Andromeda</Pill>
              </div>
              <p className="text-sm text-gray-600">
                {metis == null ? 'Reading your balance…' : metis > 0.01 ? `${metis.toFixed(3)} METIS in your wallet. Enough for ${Math.floor(metis / 0.015)} Oracle calls at today’s price.` : 'No METIS yet. m.USDC and m.USDT work too, or bridge a little METIS.'}
              </p>
            </div>
            <button onClick={dismiss} className="text-gray-400 hover:text-black text-xl leading-none" aria-label="Dismiss">
              ×
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            {[
              { icon: '🔮', title: 'Ask the Oracle', body: '$0.05, one transaction, held in escrow until the call is revealed.', href: '/oracle' },
              { icon: '📐', title: 'Follow ST Quant', body: 'Watch it work on the floor. Back it once its record opens.', href: '/agents/st-quant' },
              { icon: '🧠', title: 'Build an agent', body: 'Plain English in, a sealed strategy out. Earn 80% of backers.', href: '/build' },
            ].map(x => (
              <a key={x.title} href={x.href} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-purple-400 hover:shadow-md transition-all">
                <div className="text-2xl mb-1">{x.icon}</div>
                <div className="font-bold text-black text-sm">{x.title}</div>
                <div className="text-xs text-gray-600 mt-0.5">{x.body}</div>
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" variant="secondary" href="https://bridge.metis.io" external>
              Get METIS on the bridge ↗
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openTelegram().catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))}>
              ✈️ Get calls on Telegram
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Got it
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
