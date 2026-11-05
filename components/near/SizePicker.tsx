'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '../ui'
import { MAX_BUYS_PER_DAY } from '@/lib/near/vault'

/**
 * How big it may go. The amount itself is the field: tap it and type any size, or take a preset.
 * There is no ceiling here and none in the vault; the agent never spends more than the account holds.
 */

const PRESETS = [10, 25, 50, 100, 250, 1000]
const MIN = 1

function clean(text: string): string {
  const t = text.replace(/[^\d.]/g, '')
  const [whole, ...rest] = t.split('.')
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

export function SizePicker({ value, onChange, night = false, big = true }: { value: number; onChange: (dollars: number) => void; night?: boolean; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(String(value))
  }, [value, editing])
  const set = (t: string) => {
    const c = clean(t)
    setText(c)
    const n = Number(c)
    if (Number.isFinite(n) && n >= MIN) onChange(Math.round(n * 100) / 100)
  }
  const custom = !PRESETS.includes(value)
  const typeOwn = () => {
    input.current?.focus()
    input.current?.select()
  }
  const low = text !== '' && Number(text) < MIN
  return (
    <div>
      <div className="text-center">
        <label className={cx('inline-flex items-baseline justify-center num font-semibold leading-none tracking-[-0.03em] cursor-text', big ? 'text-[56px] sm:text-[64px]' : 'text-[40px]')}>
          <span className={night ? 'text-white/50' : 'text-ink-3'}>$</span>
          <input
            ref={input}
            value={text}
            inputMode="decimal"
            enterKeyHint="done"
            aria-label="Largest buy in US dollars"
            onFocus={() => setEditing(true)}
            onBlur={() => {
              setEditing(false)
              if (low || !text) setText(String(value))
            }}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            onChange={e => set(e.target.value)}
            className={cx('bg-transparent outline-none text-center p-0 m-0 border-0', night ? 'text-white' : 'text-ink')}
            style={{ width: `${Math.max(1, text.length) + 0.15}ch` }}
          />
        </label>
        <div className={cx('text-[13px] mt-2', low ? 'text-down' : night ? 'text-white/55' : 'text-ink-3')}>{low ? 'At least $1' : 'largest buy · tap the amount to type any size'}</div>
      </div>
      <div className="mt-5 grid grid-cols-4 sm:grid-cols-7 gap-2">
        {PRESETS.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cx('h-11 rounded-[14px] num text-[14.5px] font-semibold press', value === v ? (night ? 'bg-white text-ink' : 'bg-ink text-white') : night ? 'bg-white/[0.08] text-white' : 'bg-paper-2 text-ink')}
          >
            ${v >= 1000 ? `${v / 1000}k` : v}
          </button>
        ))}
        <button
          type="button"
          onClick={typeOwn}
          className={cx('h-11 rounded-[14px] text-[14px] font-semibold press col-span-2 sm:col-span-1 truncate px-2', custom ? (night ? 'bg-white text-ink' : 'bg-ink text-white') : night ? 'bg-white/[0.08] text-white' : 'bg-paper-2 text-ink')}
        >
          {custom ? `$${value.toLocaleString('en-US')}` : 'Custom'}
        </button>
      </div>
    </div>
  )
}

/** Buys a day, from 1 to the vault's 48. Selling is never limited. */
export function PerDayPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step = (d: number) => onChange(Math.min(MAX_BUYS_PER_DAY, Math.max(1, value + d)))
  return (
    <div className="flex items-center gap-3 shrink-0">
      <button type="button" onClick={() => step(-1)} disabled={value <= 1} className="w-10 h-10 rounded-full bg-paper-2 text-[20px] font-semibold press disabled:opacity-40" aria-label="Fewer buys a day">
        −
      </button>
      <span className="num text-[22px] font-semibold min-w-[2ch] text-center" aria-live="polite">
        {value}
      </span>
      <button type="button" onClick={() => step(1)} disabled={value >= MAX_BUYS_PER_DAY} className="w-10 h-10 rounded-full bg-paper-2 text-[20px] font-semibold press disabled:opacity-40" aria-label="More buys a day">
        +
      </button>
    </div>
  )
}
