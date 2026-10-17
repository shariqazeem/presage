'use client'

import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Progress, Vote } from '@/lib/client/mine'
import { price as fmtPrice } from '@/lib/client/format'
import { Sigil } from './Sigil'
import { IconDown, IconSearch, IconUp, IconX } from './icons'
import { cx } from './ui'

/* ---------------------------------------------------------------- the voters */

/** How a model is introduced: a short name and a colour. Unknown models still get a fair badge. */
export function voterInfo(model: string): { name: string; color: string; quant?: boolean } {
  const m = model.toLowerCase()
  if (m === 'presage-quant-v1') return { name: 'Quant', color: '#0A0A0A', quant: true }
  if (m.includes('gpt') || m.startsWith('openai/')) return { name: 'GPT', color: '#10A37F' }
  if (m.includes('claude') || m.startsWith('anthropic/')) return { name: 'Claude', color: '#D97757' }
  if (m.includes('grok') || m.startsWith('x-ai/')) return { name: 'Grok', color: '#374151' }
  if (m.includes('gemini') || m.startsWith('google/')) return { name: 'Gemini', color: '#4285F4' }
  if (m.includes('deepseek')) return { name: 'DeepSeek', color: '#4D6BFE' }
  if (m.includes('qwen')) return { name: 'Qwen', color: '#615CED' }
  if (m.includes('llama') || m.startsWith('meta')) return { name: 'Llama', color: '#0467DF' }
  const last = model.split('/').pop() ?? model
  return { name: last.split('-')[0].replace(/^\w/, c => c.toUpperCase()), color: '#6B7280' }
}

export function VoterAvatar({ model, size = 34 }: { model: string; size?: number }) {
  const v = voterInfo(model)
  if (v.quant) return <Sigil id={0} slug="oracle" size={size} className="rounded-full" />
  return (
    <div className="rounded-full grid place-items-center text-white font-black shrink-0" style={{ width: size, height: size, background: v.color, fontSize: size * 0.4 }}>
      {v.name[0]}
    </div>
  )
}

type BoardVote = Pick<Vote, 'model' | 'direction' | 'confidence'> & { why?: string }

/**
 * The vote as it lands: each voter thinks, then its vote drops in. With `final` set, a voter that never
 * answered says so plainly instead of thinking forever.
 */
export function VoteBoard({ voters, votes, final = false }: { voters: string[]; votes: BoardVote[]; final?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null)
  const list = voters.length ? voters : votes.map(v => v.model)
  const ups = votes.filter(v => v.direction === 'up').length
  const downs = votes.length - ups
  const pickedVote = votes.find(v => v.model === picked)
  return (
    <div>
      <div className={cx('grid gap-2', list.length <= 4 ? 'grid-cols-4' : 'grid-cols-5')}>
        {list.map((m, i) => {
          const v = votes.find(x => x.model === m)
          const info = voterInfo(m)
          return (
            <button
              key={`${m}-${i}`}
              onClick={() => setPicked(p => (p === m ? null : m))}
              className={cx(
                'rounded-2xl border-2 py-2.5 px-1 flex flex-col items-center transition-colors text-center',
                v ? (v.direction === 'up' ? 'border-green-100 bg-green-50/70' : 'border-red-100 bg-red-50/70') : 'border-gray-100 bg-white',
                picked === m && 'ring-2 ring-black/80',
              )}
            >
              <VoterAvatar model={m} size={34} />
              <div className="text-[11px] font-bold text-gray-600 mt-1.5 truncate max-w-full">{info.name}</div>
              <AnimatePresence mode="wait">
                {v ? (
                  <motion.div key="v" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} className={cx('text-sm font-black tabular-nums flex items-center', v.direction === 'up' ? 'text-green-600' : 'text-red-600')}>
                    {v.direction === 'up' ? <IconUp size={13} weight={3} /> : <IconDown size={13} weight={3} />}
                    {v.confidence}%
                  </motion.div>
                ) : final ? (
                  <motion.div key="n" className="text-[11px] font-bold text-gray-400">no answer</motion.div>
                ) : (
                  <motion.div key="t" className="text-[11px] font-bold text-gray-400 soft-pulse">
                    thinking
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>
      {votes.length > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[12px] font-bold">
            <span className="text-green-600">{ups} {ups === 1 ? 'says' : 'say'} up</span>
            <span className="text-red-500">{downs} {downs === 1 ? 'says' : 'say'} down</span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-red-100 overflow-hidden">
            <motion.div className="h-full grad rounded-full" initial={{ width: '50%' }} animate={{ width: `${(ups / Math.max(1, votes.length)) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
        </div>
      )}
      <AnimatePresence>
        {pickedVote?.why && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-2xl bg-gray-50 px-3.5 py-2.5 text-[13px] text-gray-700">
              <b className="text-black">{voterInfo(pickedVote.model).name}:</b> {pickedVote.why}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const stageLine = (p: Progress | null) => (!p || p.stage === 'reading' ? 'Reading the market' : p.stage === 'voting' ? 'The AIs are voting' : 'Sealing it on Metis')

/* ---------------------------------------------------------------- the coin */

export type Coin = { symbol: string; name: string; price: number; changePct: number; quoteVolume: number }

export function Change({ v, className = '' }: { v: number | null | undefined; className?: string }) {
  if (v == null || Number.isNaN(v)) return <span className={cx('text-gray-400', className)}>—</span>
  return <span className={cx('tabular-nums font-bold', v >= 0 ? 'text-green-600' : 'text-red-600', className)}>{`${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`}</span>
}

export function Sparkline({ closes, width = 130, height = 44 }: { closes: number[]; width?: number; height?: number }) {
  const id = useId().replace(/:/g, '')
  if (closes.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const pts = closes.map((c, i) => [2 + (i / (closes.length - 1)) * (width - 4), 4 + (1 - (c - min) / span) * (height - 8)] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `M${pts[0][0]},${height} L${line.replaceAll(' ', ' L')} L${pts.at(-1)![0]},${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`l${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#9333EA" />
          <stop offset="0.55" stopColor="#EC4899" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id={`a${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#EC4899" stopOpacity="0.14" />
          <stop offset="1" stopColor="#EC4899" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#a${id})`} />
      <polyline fill="none" stroke={`url(#l${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" points={line} />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="3.2" fill="#2563EB" />
    </svg>
  )
}

/**
 * Pick a coin: a search box over all of them, and a few to tap. BTC, ETH and METIS always sit first;
 * the rest are whatever is moving most today.
 */
export function CoinPicker({ coins, selected, onSelect }: { coins: Coin[]; selected: string; onSelect: (s: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const chips = useMemo(() => {
    const pinned = ['BTC', 'ETH', 'METIS'].map(s => coins.find(c => c.symbol === s)).filter((c): c is Coin => Boolean(c))
    const movers = coins
      .filter(c => !['BTC', 'ETH', 'METIS'].includes(c.symbol) && c.quoteVolume > 5_000_000)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 3)
    const list = [...pinned, ...movers]
    const sel = coins.find(c => c.symbol === selected)
    if (sel && !list.some(c => c.symbol === selected)) list[list.length - 1] = sel
    return list
  }, [coins, selected])
  const found = useMemo(() => {
    const t = q.trim().toLowerCase()
    const all = [...coins].sort((a, b) => b.quoteVolume - a.quoteVolume)
    return t ? all.filter(c => c.symbol.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)) : all
  }, [coins, q])
  return (
    <div>
      <div className="relative">
        <div className={cx('h-12 rounded-2xl bg-gray-100 flex items-center gap-2 px-4 transition-all', open && 'bg-white ring-2 ring-black')}>
          <IconSearch size={17} className="text-gray-400 shrink-0" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={`Search ${coins.length || 84} coins`}
            className="flex-1 bg-transparent outline-none font-semibold text-[15px] text-black placeholder:text-gray-400 placeholder:font-medium min-w-0"
          />
          {open && (
            <button
              onClick={() => {
                setOpen(false)
                setQ('')
              }}
              className="w-7 h-7 rounded-full bg-gray-100 grid place-items-center text-gray-500"
              aria-label="Close search"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute z-30 left-0 right-0 mt-2 bg-white rounded-2xl border-2 border-gray-100 shadow-2xl max-h-[340px] overflow-y-auto p-2">
              {found.length === 0 && <div className="p-4 text-sm text-gray-500 text-center">No coin called “{q}”. The Oracle covers {coins.length}.</div>}
              {found.map(c => (
                <button
                  key={c.symbol}
                  onClick={() => {
                    onSelect(c.symbol)
                    setOpen(false)
                    setQ('')
                  }}
                  className={cx('w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50', c.symbol === selected && 'bg-gray-50')}
                >
                  <div className="min-w-0">
                    <span className="font-black text-black">{c.symbol}</span> <span className="text-sm text-gray-500 truncate">{c.name}</span>
                  </div>
                  <div className="text-right shrink-0 text-sm">
                    <span className="tabular-nums font-semibold text-gray-700">${fmtPrice(c.price)}</span> <Change v={c.changePct} className="ml-1" />
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {chips.map(c => {
          const on = c.symbol === selected
          return (
            <motion.button
              key={c.symbol}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(c.symbol)}
              className={cx('rounded-2xl px-3 py-2 text-left transition-all', on ? 'grad text-white shadow-lg shadow-pink-500/20' : 'border-2 border-gray-100 hover:border-gray-300 bg-white')}
            >
              <div className="font-black text-sm">{c.symbol}</div>
              {on ? <div className="text-[11px] font-bold tabular-nums opacity-90">{`${c.changePct >= 0 ? '+' : '−'}${Math.abs(c.changePct).toFixed(1)}%`}</div> : <Change v={c.changePct} className="text-[11px]" />}
            </motion.button>
          )
        })}
        {chips.length === 0 && [0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-[52px] rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 p-1 bg-white rounded-2xl border-2 border-gray-100 text-sm font-bold text-center" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('relative py-2 rounded-xl transition-colors', value === o.value ? 'text-white' : 'text-gray-500 hover:text-black')}>
          {value === o.value && <motion.span layoutId={`seg-${options.map(x => x.value).join('')}`} className="absolute inset-0 rounded-xl bg-black" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Your own call, made before the AIs answer, sealed together with theirs. Tap again to take it back. */
export function MyCall({ value, onChange }: { value: 'up' | 'down' | null; onChange: (v: 'up' | 'down' | null) => void }) {
  const b = (d: 'up' | 'down') => (
    <button
      onClick={() => onChange(value === d ? null : d)}
      className={cx(
        'px-3 py-1.5 rounded-xl border-2 text-sm font-black flex items-center gap-1 transition-all',
        value === d ? (d === 'up' ? 'bg-green-600 border-green-600 text-white' : 'bg-red-600 border-red-600 text-white') : cx('bg-white border-gray-200', d === 'up' ? 'text-green-600 hover:border-green-400' : 'text-red-600 hover:border-red-400'),
      )}
    >
      {d === 'up' ? <IconUp size={14} weight={3} /> : <IconDown size={14} weight={3} />}
      {d === 'up' ? 'Up' : 'Down'}
    </button>
  )
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[13px] font-semibold text-gray-700">
        Your call first? <span className="text-gray-400 font-medium">optional</span>
      </div>
      <div className="flex gap-2">
        {b('up')}
        {b('down')}
      </div>
    </div>
  )
}
