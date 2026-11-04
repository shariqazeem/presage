'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cx } from '../ui'

/**
 * The small set of controls every ParallaxPay screen is built from, so a toggle, a tab or an action
 * button looks and moves the same everywhere. Night versions sit on the agent's dark surfaces.
 */

/** iOS-style segmented control; the thumb slides to the picked option. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  night = false,
  size = 'md',
  layoutId,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  night?: boolean
  size?: 'sm' | 'md'
  /** Unique per control on a page, so thumbs don't fly between controls. */
  layoutId: string
}) {
  return (
    <div className={cx('inline-flex rounded-full p-0.5', night ? 'bg-white/[0.07]' : 'bg-paper-2')} role="tablist">
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx('relative rounded-full press font-semibold', size === 'sm' ? 'h-7 px-3 text-[12px]' : 'h-9 px-4 text-[13.5px]', on ? (night ? 'text-ink' : 'text-white') : night ? 'text-[#A1A1AA] hover:text-white' : 'text-ink-3 hover:text-ink')}
          >
            {on && <motion.span layoutId={layoutId} className={cx('absolute inset-0 rounded-full', night ? 'bg-white' : 'bg-ink')} transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** iOS-style switch. */
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx('relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 disabled:opacity-50', on ? 'bg-up' : 'bg-[#D6D6D2]')}
    >
      <motion.span className="absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]" animate={{ x: on ? 20 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 36 }} />
    </button>
  )
}

/** A round action with its label under it, like an exchange app's quick actions. */
export function IconAction({ icon, label, onClick, href, tone = 'light' }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; tone?: 'light' | 'night' | 'danger' }) {
  const circle = cx(
    'w-12 h-12 rounded-full grid place-items-center press',
    tone === 'light' && 'bg-ink text-white',
    tone === 'night' && 'bg-white text-ink',
    tone === 'danger' && 'bg-down text-white',
  )
  const body = (
    <>
      <span className={circle}>{icon}</span>
      <span className="text-[12.5px] font-semibold">{label}</span>
    </>
  )
  if (href)
    return (
      <a href={href} className="flex flex-col items-center gap-1.5">
        {body}
      </a>
    )
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      {body}
    </button>
  )
}

/** A status pill: what the agent is doing on a coin, or the state of a trade. */
export function Chip({ children, tone = 'muted', night = false }: { children: ReactNode; tone?: 'muted' | 'live' | 'up' | 'down' | 'strong'; night?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 h-[22px] text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap',
        tone === 'live' && 'foil text-white',
        tone === 'muted' && (night ? 'bg-white/[0.08] text-[#A1A1AA]' : 'bg-paper-2 text-ink-3'),
        tone === 'strong' && (night ? 'bg-white text-ink' : 'bg-ink text-white'),
        tone === 'up' && (night ? 'bg-up-d/15 text-up-d' : 'bg-up/10 text-up'),
        tone === 'down' && (night ? 'bg-down-d/15 text-down-d' : 'bg-down/10 text-down'),
      )}
    >
      {children}
    </span>
  )
}

/** A sparkline from a list of prices, coloured by where it ended. */
export function Sparkline({ points, w = 64, h = 24, night = true }: { points: number[]; w?: number; h?: number; night?: boolean }) {
  if (points.length < 2) return <span style={{ width: w, height: h }} className="inline-block" />
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const up = points.at(-1)! >= points[0]
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 2 - ((p - lo) / (hi - lo || 1)) * (h - 4)])
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = up ? (night ? '#3DDC84' : '#12A150') : night ? '#FF6B6B' : '#E5484D'
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <polyline points={`0,${h} ${line} ${w},${h}`} fill={color} fillOpacity="0.1" stroke="none" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export const signedPct = (v: number | null | undefined) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`)
