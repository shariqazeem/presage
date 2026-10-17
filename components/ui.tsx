'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/**
 * Small shared parts. Called's look lives in components/kit.tsx and app/globals.css: paper and ink,
 * ledger-style mono numbers, and the foil seal only on what is sealed, live or yours.
 */

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/** Animates a number from its previous value to the new one. */
export function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    const delta = value - start
    if (delta === 0) return
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(start + delta * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

export function CountUp({ value, decimals = 0, prefix = '', suffix = '' }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const n = useCountUp(value)
  return (
    <>
      {prefix}
      {n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  )
}

/** The last ten outcomes as a ledger strip, newest on the right: right, wrong, flat. */
export function FormDots({ form, size = 'md' }: { form: ('win' | 'loss' | 'flat' | 'nofill' | 'forfeited')[]; size?: 'sm' | 'md' }) {
  const d = size === 'sm' ? 'w-[9px] h-[9px] rounded-[2.5px]' : 'w-[11px] h-[11px] rounded-[3px]'
  const color = { win: 'bg-up', loss: 'bg-down', forfeited: 'bg-down opacity-60', flat: 'bg-[#C9C9CF]', nofill: 'bg-line' }
  const pad = Array.from({ length: Math.max(0, 10 - form.length) })
  return (
    <div className="flex items-center gap-[3px]" title={form.length ? `Last ${form.length}: ${form.join(', ')}` : 'No scored calls yet'}>
      {pad.map((_, i) => (
        <span key={`p${i}`} className={cx(d, 'bg-paper-2 border border-line')} />
      ))}
      {form.map((o, i) => (
        <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.03 }} className={cx(d, color[o])} />
      ))}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-[14px] bg-paper-2', className)} />
}
