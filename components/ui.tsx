'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Presage's design system: ParallaxPay's look (white, black buttons, the purple-pink-blue gradient,
 * heavy headlines) as a small set of parts every page is built from.
 */

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export const GRADIENT_TEXT = 'bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600 bg-clip-text text-transparent'
export const GRADIENT_BG = 'bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600'

export function Container({ children, className = '', wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cx(wide ? 'max-w-[1600px]' : 'max-w-7xl', 'mx-auto px-4 sm:px-6 lg:px-8', className)}>{children}</div>
}

type ButtonProps = {
  children: ReactNode
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'gradient' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  full?: boolean
  external?: boolean
}

export function Button({ children, href, onClick, variant = 'primary', size = 'md', disabled, className = '', full, external }: ButtonProps) {
  const base = cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all whitespace-nowrap select-none',
    size === 'sm' ? 'px-4 py-2 text-sm' : size === 'lg' ? 'px-8 py-4 text-lg' : 'px-6 py-3 text-base',
    variant === 'primary' && 'bg-black text-white hover:bg-gray-800 shadow-lg hover:shadow-xl',
    variant === 'secondary' && 'bg-white text-black border-2 border-gray-300 hover:border-black',
    variant === 'gradient' && 'text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl',
    variant === 'ghost' && 'text-gray-700 hover:text-black hover:bg-gray-100',
    variant === 'danger' && 'bg-red-50 text-red-700 border-2 border-red-200 hover:border-red-400',
    disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
    full && 'w-full',
    className,
  )
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={base}>
        {children}
      </a>
    ) : (
      <Link href={href} className={base}>
        {children}
      </Link>
    )
  }
  return (
    <motion.button whileHover={disabled ? undefined : { scale: 1.02 }} whileTap={disabled ? undefined : { scale: 0.98 }} onClick={onClick} disabled={disabled} className={base}>
      {children}
    </motion.button>
  )
}

export function Card({
  children,
  className = '',
  tone = 'default',
  hover = false,
  padding = 'md',
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'soft' | 'purple' | 'green' | 'red' | 'blue' | 'black'
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  as?: 'div' | 'section' | 'article'
}) {
  const tones = {
    default: 'bg-white border-gray-200',
    soft: 'bg-gray-50 border-gray-200',
    purple: 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    blue: 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200',
    black: 'bg-black text-white border-black',
  }
  const pad = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8 sm:p-10' }[padding]
  return <As className={cx('rounded-2xl border-2 shadow-sm', tones[tone], pad, hover && 'hover:shadow-lg hover:border-gray-300 transition-all', className)}>{children}</As>
}

export function Pill({ children, tone = 'gray', className = '', pulse = false }: { children: ReactNode; tone?: 'gray' | 'black' | 'green' | 'red' | 'purple' | 'blue' | 'yellow' | 'gradient'; className?: string; pulse?: boolean }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    black: 'bg-black text-white',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-800',
    gradient: 'text-white bg-gradient-to-r from-purple-500 to-pink-500',
  }
  return (
    <span className={cx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap', tones[tone], className)}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  )
}

export function LiveDot({ className = '', color = 'bg-green-500' }: { className?: string; color?: string }) {
  return (
    <span className={cx('relative inline-flex w-2.5 h-2.5', className)}>
      <span className={cx('absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping', color)} />
      <span className={cx('relative inline-flex w-2.5 h-2.5 rounded-full', color)} />
    </span>
  )
}

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

export function Stat({
  icon,
  value,
  label,
  sub,
  tone = 'default',
  delay = 0,
  size = 'md',
}: {
  icon?: string
  value: ReactNode
  label: string
  sub?: string
  tone?: 'default' | 'green' | 'red' | 'purple' | 'blue' | 'orange'
  delay?: number
  size?: 'sm' | 'md'
}) {
  const tones = {
    default: ['border-gray-200', 'text-black'],
    green: ['border-green-200', 'text-green-600'],
    red: ['border-red-200', 'text-red-600'],
    purple: ['border-purple-200', 'text-purple-600'],
    blue: ['border-blue-200', 'text-blue-600'],
    orange: ['border-orange-200', 'text-orange-600'],
  }[tone]
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className={cx('bg-white rounded-2xl border-2 shadow-sm', tones[0], size === 'sm' ? 'p-4' : 'p-6')}>
      {icon && <div className={cx(size === 'sm' ? 'text-xl mb-1' : 'text-3xl mb-2')}>{icon}</div>}
      <div className={cx('font-black tabular-nums', tones[1], size === 'sm' ? 'text-2xl' : 'text-4xl')}>{value}</div>
      <div className={cx('font-semibold text-gray-600', size === 'sm' ? 'text-xs' : 'text-sm')}>{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </motion.div>
  )
}

export function SectionHead({ eyebrow, title, sub, right, className = '' }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col md:flex-row md:items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="mb-3">{eyebrow}</div>}
        <h2 className="text-3xl sm:text-4xl font-black text-black tracking-tight">{title}</h2>
        {sub && <p className="text-lg text-gray-600 mt-2">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function Empty({ emoji, title, body, action }: { emoji: string; title: string; body: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-blue-50 to-purple-50 p-8 rounded-2xl border-2 border-blue-200 text-center">
      <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }} className="text-6xl mb-4">
        {emoji}
      </motion.div>
      <h3 className="text-2xl font-bold text-black mb-2">{title}</h3>
      <p className="text-gray-600 mb-5 max-w-xl mx-auto">{body}</p>
      {action}
    </motion.div>
  )
}

/** A row of outcomes as dots, like a form guide. Newest on the right. */
export function FormDots({ form, size = 'md' }: { form: ('win' | 'loss' | 'flat' | 'nofill' | 'forfeited')[]; size?: 'sm' | 'md' }) {
  const d = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
  const color = { win: 'bg-green-500', loss: 'bg-red-500', forfeited: 'bg-red-800', flat: 'bg-gray-400', nofill: 'bg-gray-200 border border-gray-300' }
  const pad = Array.from({ length: Math.max(0, 10 - form.length) })
  return (
    <div className="flex items-center gap-1" title={form.length ? `Last ${form.length}: ${form.join(', ')}` : 'No scored calls yet'}>
      {pad.map((_, i) => (
        <span key={`p${i}`} className={cx(d, 'rounded-full bg-gray-100')} />
      ))}
      {form.map((o, i) => (
        <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.03 }} className={cx(d, 'rounded-full', color[o])} />
      ))}
    </div>
  )
}

export function Streak({ streak }: { streak: number }) {
  if (Math.abs(streak) < 2) return null
  return <Pill tone={streak > 0 ? 'green' : 'red'}>{streak > 0 ? `${streak} in a row` : `${-streak} losses running`}</Pill>
}

/** An endless horizontal ticker. */
export function Marquee({ children, speed = 60 }: { children: ReactNode; speed?: number }) {
  return (
    <div className="relative overflow-hidden group">
      <div className="flex w-max animate-[marquee_linear_infinite] group-hover:[animation-play-state:paused]" style={{ animationDuration: `${speed}s` }}>
        <div className="flex items-center gap-8 pr-8">{children}</div>
        <div className="flex items-center gap-8 pr-8" aria-hidden>
          {children}
        </div>
      </div>
      <style jsx global>{`
        @keyframes marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-gray-100', className)} />
}

export function Divider() {
  return <div className="h-px bg-gray-200 my-6" />
}
