'use client'

import { useMemo, useState } from 'react'
import { IconCheck } from '../icons'
import { cx } from '../ui'
import { COINS, coinBySymbol, type Coin } from '@/lib/near/config'
import listed from '@/lib/near/coins.json'
import { px } from '@/lib/near/drawing'
import { useLivePrices, type CoinRead } from '@/lib/near/hooks'
import { closeness } from '@/lib/near/rank'
import { signedPct } from './primitives'

/**
 * Every coin it can trade, as a list you can search: icon, name, the last two days in a line, the live
 * price, and how close the agent is to a trade on each. Used where a coin is picked: the floor (to
 * point the agent at one) and the mandate (to choose which it may buy).
 */

/** How many coins have a Rhea pool but barely trade, from the last discovery. */
export const QUIET_COINS: number = (listed as { quiet?: number }).quiet ?? 0

const HUES = ['#7C3AED', '#EC4899', '#3B82F6', '#22D3EE', '#12A150', '#F59E0B']

export function CoinIcon({ coin, size = 32, className }: { coin: Pick<Coin, 'symbol' | 'icon'>; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (coin.icon && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={coin.icon} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} className={cx('rounded-full shrink-0 bg-paper-2 object-cover', className)} style={{ width: size, height: size }} />
    )
  const hue = HUES[[...coin.symbol].reduce((n, ch) => n + ch.charCodeAt(0), 0) % HUES.length]
  return (
    <span className={cx('rounded-full shrink-0 grid place-items-center text-white font-bold', className)} style={{ width: size, height: size, background: hue, fontSize: size * 0.46 }} aria-hidden>
      {coin.symbol.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** The last two days of hourly closes, as a line. */
export function Spark({ values, w = 56, h = 22, className }: { values?: number[]; w?: number; h?: number; className?: string }) {
  if (!values || values.length < 3) return <span style={{ width: w, height: h }} className={className} />
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={w} height={h} className={cx('shrink-0', className)} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? '#12A150' : '#E5484D'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Checks({ r }: { r?: CoinRead }) {
  const checks = r?.checks ?? []
  if (!checks.length) return <span className="text-[11.5px] text-ink-3">reading…</span>
  return (
    <span className="flex gap-[2px]" title={`${checks.filter(c => c.ok).length} of ${checks.length} checks pass`} aria-label={`${checks.filter(c => c.ok).length} of ${checks.length} checks`}>
      {checks.map(c => (
        <span key={c.key} className={cx('w-[5px] h-[10px] rounded-[1.5px]', c.ok ? (r?.setup ? 'foil' : 'bg-up') : 'bg-ink/[0.12]')} />
      ))}
    </span>
  )
}

type Row = { coin: Coin; read?: CoinRead }

function useRows(reads: CoinRead[], query: string): Row[] {
  return useMemo(() => {
    const bySymbol = new Map(reads.map(r => [r.coin, r]))
    const q = query.trim().toLowerCase()
    return COINS.map(coin => ({ coin, read: bySymbol.get(coin.symbol) }))
      .filter(({ coin }) => !q || coin.symbol.toLowerCase().includes(q) || coin.name.toLowerCase().includes(q))
      .sort((a, b) => (b.read ? closeness(b.read) : -1) - (a.read ? closeness(a.read) : -1) || (b.coin.vol24 ?? 0) - (a.coin.vol24 ?? 0))
  }, [reads, query])
}

function Search({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={`Search ${count} coins`}
      inputMode="search"
      className="w-full h-11 rounded-[14px] bg-paper-2 px-4 text-[15px] outline-none focus:ring-2 focus:ring-ink/10 placeholder:text-ink-3"
    />
  )
}

/** The floor's list: tap a coin and the agent reads it on the stage. */
export function CoinList({ reads, current, onPick }: { reads: CoinRead[]; current?: string; onPick: (symbol: string) => void }) {
  const [query, setQuery] = useState('')
  const rows = useRows(reads, query)
  const { data: live } = useLivePrices()
  return (
    <div>
      <Search value={query} onChange={setQuery} count={COINS.length} />
      <ul className="mt-3 divide-y divide-line">
        {rows.map(({ coin, read }) => {
          const price = live?.prices?.[coin.symbol] ?? read?.price
          return (
            <li key={coin.id}>
              <button type="button" onClick={() => onPick(coin.symbol)} className={cx('w-full flex items-center gap-3 py-3 text-left press', current === coin.symbol && 'bg-paper-2 -mx-2 px-2 rounded-[14px]')}>
                <CoinIcon coin={coin} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[15px] leading-tight truncate">{coin.symbol}</span>
                  <span className="block text-[12.5px] text-ink-3 truncate">{coin.name}</span>
                </span>
                <Spark values={read?.spark} w={44} />
                <span className="text-right w-[92px] shrink-0">
                  <span className="block num text-[14px]">{price ? px(price) : '—'}</span>
                  <span className={cx('block num text-[12px]', (read?.change24h ?? 0) >= 0 ? 'text-up' : 'text-down')}>{read?.change24h != null ? signedPct(read.change24h) : ''}</span>
                </span>
                <span className="w-[42px] shrink-0 flex justify-end">
                  <Checks r={read} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {!rows.length && <p className="py-8 text-center text-[14px] text-ink-3">No coin called &ldquo;{query}&rdquo; trades on Rhea yet.</p>}
      {QUIET_COINS > 0 && !query && (
        <p className="mt-4 text-[12.5px] text-ink-3 leading-snug">
          Plus {QUIET_COINS} coins with a Rhea pool that barely trade. A chart nobody trades has nothing to read, so I pick them up when they wake up.
        </p>
      )}
    </div>
  )
}

/** The mandate's list: tick the coins it may buy, up to `max`. */
export function CoinChooser({ reads, chosen, onToggle, max }: { reads: CoinRead[]; chosen: string[]; onToggle: (id: string) => void; max: number }) {
  const [query, setQuery] = useState('')
  const rows = useRows(reads, query)
  return (
    <div>
      <Search value={query} onChange={setQuery} count={COINS.length} />
      <ul className="mt-2">
        {rows.map(({ coin, read }) => {
          const on = chosen.includes(coin.id)
          return (
            <li key={coin.id}>
              <button
                type="button"
                onClick={() => onToggle(coin.id)}
                aria-pressed={on}
                disabled={!on && chosen.length >= max}
                className="w-full flex items-center gap-3 py-2.5 text-left press disabled:opacity-40"
              >
                <CoinIcon coin={coin} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[15px] leading-tight truncate">{coin.symbol}</span>
                  <span className="block text-[12.5px] text-ink-3 truncate">{coin.name}</span>
                </span>
                <Spark values={read?.spark} w={48} />
                <Checks r={read} />
                <span className={cx('w-6 h-6 rounded-full grid place-items-center shrink-0', on ? 'bg-ink text-white' : 'border border-line')}>{on && <IconCheck size={12} weight={3} />}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export const coinOf = (symbol: string) => coinBySymbol(symbol)
