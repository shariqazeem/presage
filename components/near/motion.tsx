'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '../ui'

/**
 * A number whose digits roll to their new value, like a ticker. Pass the formatted string ("$4.021");
 * digits roll, everything else stays put. Screen readers get the plain value.
 */
export function RollingNumber({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={cx('inline-flex leading-none num', className)}>
      <span className="sr-only">{value}</span>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <Digit key={`${value.length}:${i}`} d={Number(ch)} />
        ) : (
          <span key={`${value.length}:${i}`} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  )
}

function Digit({ d }: { d: number }) {
  return (
    <span className="relative inline-block overflow-hidden h-[1em]" aria-hidden>
      <span className="flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transform: `translateY(-${d * 10}%)` }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <span key={n} className="h-[1em] leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  )
}

/** A class that flashes green or red for a moment whenever `value` moves up or down. */
export function useFlash(value: number | null | undefined): string {
  const prev = useRef(value)
  const [cls, setCls] = useState('')
  useEffect(() => {
    const before = prev.current
    prev.current = value
    if (before == null || value == null || before === value) return
    setCls(value > before ? 'flash-up' : 'flash-down')
    const t = setTimeout(() => setCls(''), 650)
    return () => clearTimeout(t)
  }, [value])
  return cls
}

/** A price that rolls to each new value and flashes its direction. */
export function LivePrice({ value, format, className = '' }: { value: number; format: (n: number) => string; className?: string }) {
  const flash = useFlash(value)
  return (
    <span className={cx('rounded-[6px] px-0.5 -mx-0.5', flash, className)}>
      <RollingNumber value={format(value)} />
    </span>
  )
}
