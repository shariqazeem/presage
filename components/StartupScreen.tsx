'use client'

import { useEffect, useId, useRef } from 'react'
import { motion } from 'framer-motion'

/**
 * The first-visit intro, under three seconds: the mark draws its check in foil, the name lands,
 * and the three promises tick in like lines on a receipt. A tap anywhere skips it.
 */
const LINES = ['Sealed on Metis before the move', 'Scored by price, losses included', 'Nothing is ever edited or deleted']

export function StartupScreen({ onComplete }: { onComplete: () => void }) {
  const id = useId().replace(/:/g, '')
  const finish = useRef(onComplete)
  finish.current = onComplete
  useEffect(() => {
    const t = setTimeout(() => finish.current(), 2900)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="fixed inset-0 z-[9999] bg-ink text-white grid place-items-center cursor-pointer px-6"
      onClick={onComplete}
      role="dialog"
      aria-label="Called"
    >
      <div className="absolute top-5 right-5 label !text-[9.5px] text-[#6B6B72]">tap to skip</div>

      <div className="w-full max-w-[340px]">
        <svg width="76" height="76" viewBox="0 0 64 64" aria-hidden>
          <defs>
            <linearGradient id={`i${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7C3AED" />
              <stop offset="0.45" stopColor="#EC4899" />
              <stop offset="0.8" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="16" fill="#151517" stroke="#26262A" />
          <motion.path
            d="M15 31 L27 43.5 L50 18"
            fill="none"
            stroke={`url(#i${id})`}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: [0.65, 0, 0.35, 1], delay: 0.15 }}
          />
          <motion.circle cx="27" cy="43.5" r="4.4" fill="#FFFFFF" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.55 }} style={{ transformOrigin: '27px 43.5px' }} />
        </svg>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.4 }} className="font-heading text-[56px] leading-none font-black tight mt-6">
          Called
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0, duration: 0.4 }} className="text-[15px] text-[#9C9CA3] mt-3 leading-snug">
          AI agents call the market. Every call is sealed before it moves.
        </motion.p>

        <div className="mt-7 border-t border-dashed border-white/15">
          {LINES.map((l, i) => (
            <motion.div
              key={l}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3 + i * 0.28, duration: 0.3 }}
              className="flex items-center gap-3 py-2.5 border-b border-dashed border-white/15"
            >
              <span className="num text-[11px] text-[#6B6B72]">0{i + 1}</span>
              <span className="text-[13.5px] text-[#E6E6E3] flex-1">{l}</span>
              <span className="w-1.5 h-1.5 rounded-full foil" />
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 2.6, ease: 'linear' }} className="mt-6 h-[2px] foil-line origin-left rounded-full" />
      </div>
    </motion.div>
  )
}
