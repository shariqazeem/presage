'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AgentEvent, AgentStatus, RadarRow } from '@/lib/floor-types'
import type { CallView } from '@/lib/server/records'
import { price as fmtPrice } from '@/lib/client/format'
import { Sigil } from './Sigil'
import { IconCheck, IconDown, IconLock, IconUp, IconX } from './icons'
import { cx } from './ui'

/* ---------------------------------------------------------------- time */

/** The current unix second, ticking. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${m}:${String(ss).padStart(2, '0')}`
}

/** Hours and minutes, the way a ring shows it: 1:12 or 0:42. */
export function shortClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`
}

export const hhmm = (sec: number) => new Date(sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** True once the page is running in the browser, so local times never disagree with the server's. */
export function useMounted(): boolean {
  const [m, setM] = useState(false)
  useEffect(() => setM(true), [])
  return m
}

/** A time of day in the reader's own timezone. */
export function At({ sec }: { sec: number }) {
  const mounted = useMounted()
  return <span className="tabular-nums">{mounted ? hhmm(sec) : '—'}</span>
}

export function Countdown({ to, className = '', done = 'opening…' }: { to: number; className?: string; done?: string }) {
  const now = useNow()
  const mounted = useMounted()
  const left = to - now
  return <span className={cx('tabular-nums', className)}>{!mounted ? '' : left > 0 ? clock(left) : done}</span>
}

/** A countdown ring: the part still to come in foil, the part already gone as a quiet track. */
export function Ring({ progress, size = 60, stroke = 5, label, dark = true, labelClass = '' }: { progress: number; size?: number; stroke?: number; label?: ReactNode; dark?: boolean; labelClass?: string }) {
  const id = useId().replace(/:/g, '')
  const p = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.45" stopColor="#EC4899" />
            <stop offset="0.8" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? '#2A2A2E' : '#E6E6E3'} strokeWidth={stroke} />
        {p > 0.002 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#r${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} />}
      </svg>
      {label != null && (
        <div className={cx('absolute inset-0 grid place-items-center num font-semibold', dark ? 'text-white' : 'text-ink', labelClass)} style={{ fontSize: size / 4.4 }}>
          {label}
        </div>
      )}
    </div>
  )
}

/** A ring that counts down to `to`, full when `from` was. */
export function CountdownRing({ from, to, size = 60, dark = true }: { from: number; to: number; size?: number; dark?: boolean }) {
  const now = useNow(1000)
  const mounted = useMounted()
  const total = Math.max(1, to - from)
  const left = Math.max(0, to - now)
  return <Ring size={size} dark={dark} progress={mounted ? left / total : 1} label={!mounted ? '' : left > 0 ? shortClock(left) : '…'} />
}

/* ---------------------------------------------------------------- outcomes */

export type Outcome = 'win' | 'loss' | 'flat' | 'nofill' | null | undefined

/** What an outcome is called. A direction call is right or wrong; a setup wins or loses. */
export function outcomeWord(kind: 'direction' | 'setup', status: string, outcome: Outcome): { label: string; tone: 'green' | 'red' | 'gray' | 'purple' | 'darkred' } {
  if (status === 'forfeited') return { label: 'FORFEITED', tone: 'darkred' }
  if (status === 'sealed' || status === 'pending' || !outcome) return { label: 'SEALED', tone: 'purple' }
  if (outcome === 'win') return { label: kind === 'direction' ? 'RIGHT' : 'WIN', tone: 'green' }
  if (outcome === 'loss') return { label: kind === 'direction' ? 'WRONG' : 'LOSS', tone: 'red' }
  if (outcome === 'nofill') return { label: 'NO FILL', tone: 'gray' }
  return { label: 'FLAT', tone: 'gray' }
}

const VERDICT_TONE = {
  green: 'text-up',
  red: 'text-down',
  gray: 'text-ink-3',
  purple: '',
  darkred: 'text-down line-through decoration-2',
}

export function ResultPill({ kind, status, outcome, className = '' }: { kind: 'direction' | 'setup'; status: string; outcome: Outcome; className?: string }) {
  const w = outcomeWord(kind, status, outcome)
  if (w.tone === 'purple') return <SealedChip className={className} />
  return <span className={cx('label whitespace-nowrap', VERDICT_TONE[w.tone], className)}>{w.label}</span>
}

/** A sealed call: a black chip with the foil seal. */
export function SealedChip({ className = '', label = 'Sealed' }: { className?: string; label?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2 rounded-full bg-ink text-white label !text-[9.5px] whitespace-nowrap', className)}>
      <span className="w-2 h-2 rounded-full foil" />
      {label}
    </span>
  )
}

/** The seal itself, as a sticker: foil, with a black core and a white centre. */
export function Seal({ size = 28 }: { size?: number }) {
  return (
    <span className="rounded-full foil grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <span className="rounded-full bg-ink grid place-items-center" style={{ width: size * 0.5, height: size * 0.5 }}>
        <span className="rounded-full bg-white" style={{ width: size * 0.2, height: size * 0.2 }} />
      </span>
    </span>
  )
}

/** A result as people read it: +1.03% for a direction call, +2.1R for a setup. */
export function resultText(kind: 'direction' | 'setup', v: number | null | undefined): string {
  if (v == null) return ''
  return kind === 'setup' ? `${v >= 0 ? '+' : '−'}${Math.abs(v / 100).toFixed(2)}R` : `${v >= 0 ? '+' : '−'}${Math.abs(v / 100).toFixed(2)}%`
}

export function Dir({ d, className = '', word = true }: { d: 'up' | 'down'; className?: string; word?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-bold', d === 'up' ? 'text-up' : 'text-down', className)}>
      {d === 'up' ? <IconUp size={15} weight={3} /> : <IconDown size={15} weight={3} />}
      {word && d}
    </span>
  )
}

/* ---------------------------------------------------------------- calls */

/** One call in one line: whose, what, from where to where, and how it came out. */
export function CallLine({ c, mine, className = '' }: { c: CallView; mine?: { myCall?: 'up' | 'down' | null } | null; className?: string }) {
  const p = c.payload
  const exit = (c.resolution as { exitPrice?: number } | null)?.exitPrice
  const horizon = c.horizonSec ? `${c.horizonSec / 3600}h` : null
  let title: ReactNode
  let sub: ReactNode
  if (p?.rules === 'called/direction-v1') {
    title = (
      <>
        {p.asset.symbol} <Dir d={p.direction} /> <span className="text-ink-3 font-medium text-[13px]">· {p.horizonSec / 3600}h</span>
      </>
    )
    sub = (
      <>
        {fmtPrice(p.priceAtIssue)}
        {exit != null ? ` → ${fmtPrice(exit)}` : ` · ${p.confidence}% sure`}
        {mine?.myCall ? ` · you said ${mine.myCall}` : ''}
      </>
    )
  } else if (p?.rules === 'called/setup-v1') {
    const risk = ((p.entry.price - p.stop) / p.entry.price) * 100
    const reward = ((p.target - p.entry.price) / p.entry.price) * 100
    title = (
      <>
        {p.asset.symbol} <span className="text-up font-bold">long</span> <span className="text-ink-3 font-medium text-[13px]">· setup</span>
      </>
    )
    sub = (
      <>
        buy ${fmtPrice(p.entry.price)} · stop −{risk.toFixed(1)}% · target +{reward.toFixed(1)}%
      </>
    )
  } else {
    title = (
      <span className="inline-flex items-center gap-1.5">
        <IconLock size={14} weight={2.4} className="text-ink" />
        {c.asset ? `${c.asset}${horizon ? ` · ${horizon}` : ''}` : c.paid ? 'A paid question' : c.kind === 'setup' ? 'A sealed setup' : 'A sealed call'}
      </span>
    )
    sub = c.opensAt ? <>opens <At sec={c.opensAt} /></> : <>levels show when it closes</>
  }
  return (
    <Link href={`/calls/${c.id}`} className={cx('flex items-center gap-3 py-3 group', className)}>
      <Sigil id={c.agentId} slug={c.agentSlug === 'oracle' || c.agentSlug === 'st-quant' ? c.agentSlug : undefined} size={40} className="rounded-[12px] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] text-ink flex items-center gap-1.5 truncate">{title}</div>
        <div className="num text-[12.5px] text-ink-3 truncate">{sub}</div>
      </div>
      <div className="text-right shrink-0">
        <ResultPill kind={c.kind} status={c.status} outcome={c.outcome} />
        {c.result != null && c.outcome !== 'nofill' && (
          <div className={cx('num text-[15px] font-semibold mt-0.5', c.outcome === 'win' ? 'text-up' : c.outcome === 'loss' ? 'text-down' : 'text-ink-3')}>{resultText(c.kind, c.result)}</div>
        )}
        {c.status === 'sealed' && c.opensAt && (
          <div className="num text-[12px] font-medium text-ink-3 mt-1">
            <Countdown to={c.opensAt} />
          </div>
        )}
      </div>
    </Link>
  )
}

/* ---------------------------------------------------------------- radar */

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

type Placed = { row: RadarRow; x: number; y: number; r: number; ring: RadarRow['state'] }

/**
 * Where each market sits: setting up in the middle, close around it, the rest further out. Each ring
 * spaces its markets evenly, so names never sit on top of each other; the inner ring grows with how
 * many are setting up.
 */
function place(rows: RadarRow[], R: number): Placed[] {
  const out: Placed[] = []
  const byHash = (a: RadarRow, b: RadarRow) => hash(a.ref || String(a.symbol)) - hash(b.ref || String(b.symbol))
  const ring = (state: RadarRow['state'], list: RadarRow[], lo: number, hi: number, jitter: boolean) => {
    const phase = ((hash(state) % 360) * Math.PI) / 180
    const spacing = (2 * Math.PI) / Math.max(1, list.length)
    list.forEach((row, i) => {
      const h = hash(row.ref || `${row.symbol}${i}`)
      const a = phase + i * spacing + (jitter ? ((h % 1000) / 1000 - 0.5) * spacing * 0.5 : 0)
      const d = R * (jitter ? lo + (((h >> 10) % 1000) / 1000) * (hi - lo) : lo)
      out.push({ row, x: R + Math.cos(a) * d, y: R + Math.sin(a) * d, r: d, ring: state })
    })
  }
  ring('quiet', rows.filter(r => r.state === 'quiet').sort(byHash), 0.84, 0.95, true)
  ring('watching', rows.filter(r => r.state === 'watching').sort(byHash), 0.68, 0.8, true)
  ring('close', rows.filter(r => r.state === 'close').sort(byHash), 0.55, 0.55, false)
  const firing = rows.filter(r => r.state === 'firing').sort((a, b) => b.score - a.score)
  ring('firing', firing, firing.length <= 1 ? 0 : Math.min(0.3, 0.1 + 0.03 * firing.length), 0, false)
  return out
}

/**
 * Every market an agent watches as one picture. `labels` names the ones setting up and close;
 * `onSelect` makes each dot tappable.
 */
export function RadarViz({
  rows,
  size = 300,
  labels = true,
  dark = false,
  onSelect,
  selected,
}: {
  rows: RadarRow[]
  size?: number
  labels?: boolean
  dark?: boolean
  onSelect?: (r: RadarRow) => void
  selected?: string | null
}) {
  const id = useId().replace(/:/g, '')
  const R = size / 2
  const placed = useMemo(() => place(rows, R), [rows, R])
  const small = size < 120
  // Drawn for a black card: quiet markets recede, close ones are white, setups forming are foil.
  const ringColor = '#26262A'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible select-none">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.45" stopColor="#EC4899" />
          <stop offset="0.8" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id={`s${id}`}>
          <stop offset="0" stopColor="#EC4899" stopOpacity="0.35" />
          <stop offset="1" stopColor="#EC4899" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0.32, 0.6, 0.97].map(k => (
        <circle key={k} cx={R} cy={R} r={R * k - 1} fill="none" stroke={ringColor} strokeWidth={small ? 1 : 1.5} />
      ))}
      {!small && (
        <g className="radar-sweep">
          <path d={`M${R} ${R} L${R} 1 A${R - 1} ${R - 1} 0 0 1 ${R + (R - 1) * Math.sin(0.85)} ${R - (R - 1) * Math.cos(0.85)} Z`} fill="#FFFFFF" opacity={0.05} />
        </g>
      )}
      {placed.map(({ row, x, y, ring }) => {
        const key = row.ref || `${row.symbol}-${x}`
        const isSel = selected != null && (row.ref === selected || row.symbol === selected)
        const hidden = !row.symbol
        if (ring === 'quiet' || ring === 'watching') {
          if (small && ring === 'quiet') return null
          return (
            <circle
              key={key}
              cx={x}
              cy={y}
              r={small ? 1.3 : isSel ? 4.5 : ring === 'watching' ? 2.9 : 2.3}
              fill={isSel ? '#FFFFFF' : ring === 'watching' ? '#52525B' : '#34343A'}
              className={onSelect ? 'cursor-pointer' : undefined}
              onClick={onSelect ? () => onSelect(row) : undefined}
            />
          )
        }
        const firing = ring === 'firing'
        const dot = small ? (firing ? 3.4 : 2.2) : firing ? 8 : 5.2
        return (
          <g key={key} className={onSelect ? 'cursor-pointer' : undefined} onClick={onSelect ? () => onSelect(row) : undefined}>
            {onSelect && <circle cx={x} cy={y} r={16} fill="transparent" />}
            {firing && !small && <circle cx={x} cy={y} r={dot * 2.6} fill={`url(#s${id})`} />}
            <circle cx={x} cy={y} r={dot} fill={firing ? `url(#g${id})` : '#FFFFFF'} className={firing ? 'foil-glow' : undefined} stroke={isSel ? '#FFFFFF' : 'none'} strokeWidth={isSel && !firing ? 0 : 2.5} />
            {isSel && !firing && <circle cx={x} cy={y} r={dot + 4} fill="none" stroke="#FFFFFF" strokeWidth={1.5} />}
            {labels && !small && (() => {
              const dx = x - R
              const dy = y - R
              const len = Math.hypot(dx, dy)
              const ux = len < 1 ? 0 : dx / len
              const uy = len < 1 ? 1 : dy / len
              const off = dot + (firing ? 11 : 9)
              return (
                <text
                  x={x + ux * off}
                  y={y + uy * off + 4}
                  textAnchor={Math.abs(ux) < 0.35 ? 'middle' : ux > 0 ? 'start' : 'end'}
                  fontFamily={firing ? 'Inter Tight' : 'IBM Plex Mono'}
                  fontWeight={firing ? 900 : 600}
                  fontSize={firing ? 12.5 : 9.5}
                  fill={firing ? '#FFFFFF' : '#9C9CA3'}
                  paintOrder="stroke"
                  stroke="#0B0B0C"
                  strokeWidth={3}
                >
                  {hidden ? '🔒' : row.symbol}
                </text>
              )
            })()}
          </g>
        )
      })}
    </svg>
  )
}

export function radarCounts(rows: RadarRow[]) {
  return {
    firing: rows.filter(r => r.state === 'firing').length,
    close: rows.filter(r => r.state === 'close').length,
    watching: rows.filter(r => r.state === 'watching').length,
    quiet: rows.filter(r => r.state === 'quiet').length,
    total: rows.length,
  }
}

/** One market against the thesis, as a checklist anyone can read. */
export function radarChecks(r: RadarRow): { label: string; ok: boolean | null; note?: string }[] {
  if (r.checks?.length) return r.checks.map(c => ({ label: c.label, ok: c.ok, note: c.saw }))
  const near = r.supportDistPct != null && r.supportDistPct <= 2.5
  return [
    {
      label: 'Sitting on strong support',
      ok: near,
      note:
        r.supportDistPct == null
          ? 'no support close below'
          : r.supportDistPct <= 0.15
            ? `right on it${r.supportKind ? ` (${r.supportKind})` : ''}`
            : near
              ? `${r.supportDistPct}% above it${r.supportKind ? ` (${r.supportKind})` : ''}`
              : `${r.supportDistPct}% above the nearest one`,
    },
    {
      label: 'Selling has run out (15 min)',
      ok: r.mfi15Pct == null ? null : r.mfi15Pct <= 12,
      note: r.mfi15Pct == null ? 'not enough data' : r.mfi15Pct <= 12 ? 'money flow at an extreme low' : r.mfi15Pct <= 25 ? 'getting there' : 'not yet',
    },
    {
      label: 'The bigger chart agrees (1 hour)',
      ok: r.mfi1hPct == null ? null : r.mfi1hPct <= 20,
      note: r.mfi1hPct == null ? 'not enough data' : r.mfi1hPct <= 20 ? 'money flow low there too' : 'not yet: a bonus, not a must',
    },
    { label: 'Moving enough to trade', ok: r.atrPct >= 0.4, note: r.atrPct >= 0.4 ? `${r.atrPct}% typical move` : 'too quiet right now' },
  ]
}

export function CheckRow({ label, ok, note, dark = false }: { label: string; ok: boolean | null; note?: string; dark?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={cx(
          'mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0',
          ok ? (dark ? 'bg-white text-ink' : 'bg-ink text-white') : dark ? 'border border-[#3F3F46] text-[#6B6B72]' : 'border border-line text-ink-3',
        )}
      >
        {ok ? <IconCheck size={11} weight={3.2} /> : <span className="text-[11px] font-bold leading-none">{ok === false ? '–' : '?'}</span>}
      </span>
      <div className="min-w-0">
        <div className={cx('text-sm font-semibold', ok ? (dark ? 'text-white' : 'text-ink') : dark ? 'text-[#8A8A92]' : 'text-ink-3')}>{label}</div>
        {note && <div className={cx('text-xs', dark ? 'text-[#6B6B72]' : 'text-ink-3')}>{note}</div>}
      </div>
    </div>
  )
}

/** A small tag in mono capitals. `foil` is for what is live or yours. */
export function Tag({ children, tone = 'outline', className = '' }: { children: ReactNode; tone?: 'solid' | 'outline' | 'soft' | 'up' | 'foil'; className?: string }) {
  const t = { solid: 'bg-ink text-white', outline: 'border border-line text-ink-2', soft: 'bg-paper-2 text-ink-3', up: 'border border-up/30 text-up', foil: 'bg-ink text-white' }[tone]
  return (
    <span className={cx('label !text-[9.5px] h-[22px] px-2 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap', t, className)}>
      {tone === 'foil' && <span className="w-1.5 h-1.5 rounded-full foil" />}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- the feed, in plain words */

type Told = { text: ReactNode; detail?: string; href?: string; tone: 'green' | 'red' | 'purple' | 'blue' | 'gray'; chart?: string | null }

/** What happened, in words a person would use. Scans and near-misses live on the radar, not here. */
export function tell(e: AgentEvent): Told | null {
  const d = e.data as Record<string, unknown>
  const sym = typeof d.symbol === 'string' ? d.symbol : null
  const who = <b className="font-semibold text-ink">{e.agentName}</b>
  switch (e.kind) {
    case 'sealed':
      return { text: <>{who} sealed a {d.kind === 'setup' ? 'setup' : 'call'}{sym ? <> on <b className="text-ink">{sym}</b></> : ''}</>, detail: e.masked ? 'The levels open to everyone when it closes.' : undefined, href: `/calls/${d.callId}`, tone: 'purple' }
    case 'resolved': {
      const kind = d.kind === 'setup' ? 'setup' : 'direction'
      if (d.outcome === 'nofill')
        return {
          text: (
            <>
              {who}’s <b className="text-ink">{sym}</b> setup expired unfilled
            </>
          ),
          detail: 'The price never came back to the entry, so no trade happened.',
          href: `/calls/${d.callId}`,
          tone: 'gray',
        }
      const w = outcomeWord(kind, 'revealed', d.outcome as Outcome)
      return {
        text: (
          <>
            {who}’s <b className="text-ink">{sym}</b> {kind === 'setup' ? 'setup' : 'call'} opened: <b className={w.tone === 'green' ? 'text-up' : w.tone === 'red' ? 'text-down' : 'text-ink-3'}>{w.label.toLowerCase()}</b> <span className="num">{resultText(kind, Number(d.result))}</span>
          </>
        ),
        href: `/calls/${d.callId}`,
        tone: w.tone === 'green' ? 'green' : w.tone === 'red' ? 'red' : 'gray',
      }
    }
    case 'answered':
      if (e.masked)
        return {
          text: d.paid ? <>{who} answered a paid question</> : <>{who} called <b className="text-ink">{sym}</b> for the next {String(d.horizon)}</>,
          detail: 'Sealed on Metis. It opens when the time is up.',
          href: `/calls/${d.callId}`,
          tone: 'blue',
        }
      return { text: <>{who} called <b className="text-ink">{sym}</b> {String(d.direction)} · {String(d.horizon)}</>, href: `/calls/${d.callId}`, tone: 'blue' }
    case 'chart_read': {
      const v = String(d.verdict)
      return {
        text: (
          <>
            {who} read {sym ? <>the <b className="text-ink">{sym}</b> chart</> : 'a chart'}: <b className={v === 'BUY' ? 'text-up' : 'text-ink-2'}>{v === 'BUY' ? 'looks right' : v === 'WAIT' ? 'not yet' : 'no'}</b>
          </>
        ),
        detail: typeof d.plain === 'string' && d.plain ? d.plain : typeof d.why === 'string' ? d.why : undefined,
        tone: v === 'BUY' ? 'green' : 'gray',
        chart: typeof d.chart === 'string' ? d.chart : null,
      }
    }
    case 'skipped':
      if (typeof d.why === 'string' && /no chart read available/.test(d.why)) return null
      return { text: <>{who} passed on {sym ? <b className="text-ink">{sym}</b> : 'a setup'}</>, detail: typeof d.why === 'string' ? d.why : undefined, tone: 'gray' }
    case 'forfeited':
      return { text: <>{who} missed a reveal</>, detail: 'It counts as a loss, and the payer is refunded.', href: `/calls/${d.callId}`, tone: 'red' }
    default:
      return null
  }
}

const DOT = { green: 'bg-up', red: 'bg-down', purple: 'foil', blue: 'bg-ink', gray: 'bg-line' }

export function FeedItem({ e, now, compact = false }: { e: AgentEvent; now: number; compact?: boolean }) {
  const t = tell(e)
  if (!t) return null
  const body = (
    <div className="flex gap-3 py-3">
      <div className="relative shrink-0">
        <Sigil id={e.agentId} slug={e.agentSlug === 'oracle' || e.agentSlug === 'st-quant' ? e.agentSlug : undefined} size={32} className="rounded-lg" />
        <span className={cx('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white', DOT[t.tone])} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-ink-2 leading-snug">{t.text}</div>
        {t.detail && <div className="text-[12.5px] text-ink-3 mt-0.5 line-clamp-2">{t.detail}</div>}
        {t.chart &&
          (compact ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/charts/read/${t.chart}`} alt="the chart it read" className="mt-2 rounded-[8px] border border-line h-14 w-24 object-cover object-left-top" loading="lazy" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/charts/read/${t.chart}`} alt="the chart it read" className="mt-2 rounded-[12px] border border-line w-full max-w-sm" loading="lazy" />
          ))}
      </div>
      <div className="num text-[11px] text-ink-3 whitespace-nowrap pt-0.5">{ago(now - e.at)}</div>
    </div>
  )
  return t.href ? (
    <Link href={t.href} className="block hover:bg-paper-2 -mx-2 px-2 rounded-[12px] transition-colors">
      {body}
    </Link>
  ) : (
    <div className="-mx-2 px-2">{body}</div>
  )
}

const ago = (d: number) => (d < 60 ? 'now' : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86_400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86_400)}d`)

export const SHOWN_KINDS = new Set(['sealed', 'resolved', 'answered', 'chart_read', 'skipped', 'forfeited'])

export function Feed({ events, max = 12, empty = 'Quiet for now. Every move the agents make lands here.', compact = false }: { events: AgentEvent[]; max?: number; empty?: string; compact?: boolean }) {
  const now = useNow(30_000)
  const shown = events.filter(e => SHOWN_KINDS.has(e.kind) && tell(e)).slice(0, max)
  if (!shown.length) return <div className="text-sm text-ink-3 py-6 text-center">{empty}</div>
  return (
    <div className="divide-y divide-line">
      {shown.map(e => (
        <FeedItem key={e.id} e={e} now={now} compact={compact} />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- status */

const STATUS_DOT: Record<AgentStatus['state'], string> = {
  scanning: 'bg-up',
  reading: 'bg-up',
  sealed: 'foil',
  answering: 'bg-up',
  waiting: 'bg-up',
  idle: 'bg-line',
  offline: 'bg-down',
}

export function StatusLine({ status, engineUp = true, className = '' }: { status: AgentStatus; engineUp?: boolean; className?: string }) {
  const live = engineUp && status.state !== 'idle'
  const dot = engineUp ? STATUS_DOT[status.state] : STATUS_DOT.offline
  return (
    <span className={cx('inline-flex items-center gap-2 min-w-0', className)}>
      <span className="relative inline-flex w-2 h-2 shrink-0">
        {live && <span className={cx('absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping', dot)} />}
        <span className={cx('relative inline-flex w-2 h-2 rounded-full', dot)} />
      </span>
      <span className="truncate">{engineUp ? status.line : 'Resting right now'}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- layout bits */

export function Panel({ children, className = '', tone = 'white', as: As = 'section' }: { children: ReactNode; className?: string; tone?: 'white' | 'dark' | 'ticket' | 'soft'; as?: 'section' | 'div' }) {
  const t = { white: 'bg-white border border-line rounded-[18px]', dark: 'bg-ink text-white rounded-[20px]', ticket: 'bg-ink text-white rounded-[20px] relative overflow-hidden', soft: 'bg-paper-2 rounded-[18px]' }[tone]
  return (
    <As className={cx(t, className)}>
      {tone === 'ticket' && <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />}
      {children}
    </As>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('label', className || 'text-ink-3')}>{children}</div>
}

export function PanelHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-lg md:text-xl font-black tight text-ink">{title}</h2>
        {sub && <div className="text-[13px] text-ink-3 mt-0.5">{sub}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/** A phrase underlined in foil: once per screen at most, on the word that matters. */
export function Sealed({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <span className="absolute left-0 right-0 -bottom-[0.06em] h-[0.09em] min-h-[3px] rounded-full foil-line" />
    </span>
  )
}

/** The big primary action: ink. On phones it can float just above the tab bar. */
export function ActionButton({
  children,
  onClick,
  href,
  tone = 'black',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  tone?: 'black' | 'white'
  disabled?: boolean
  className?: string
}) {
  const cls = cx(
    'h-[54px] w-full rounded-[14px] font-semibold text-[16px] grid place-items-center px-5 transition-all active:scale-[0.99]',
    tone === 'black' && 'bg-ink text-white hover:bg-[#26262A]',
    tone === 'white' && 'bg-white text-ink border border-line hover:border-ink',
    disabled && 'opacity-40 pointer-events-none',
    className,
  )
  if (href) return <Link href={href} className={cls}><span>{children}</span></Link>
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      <span>{children}</span>
    </button>
  )
}

/* ---------------------------------------------------------------- sheet */

/** A bottom sheet on phones, a centred card on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresenceShim open={open}>
      <motion.div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal
        className="fixed z-[61] inset-x-0 bottom-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[560px] bg-white rounded-t-[24px] md:rounded-[22px] max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1.5 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-5 md:px-6 pt-4 md:pt-6">
          <div className="font-heading text-xl font-black tight">{title}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border border-line grid place-items-center text-ink-2" aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        <div className="px-5 md:px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</div>
      </motion.div>
    </AnimatePresenceShim>
  )
}

function AnimatePresenceShim({ open, children }: { open: boolean; children: ReactNode }) {
  return <AnimatePresence>{open ? <>{children}</> : null}</AnimatePresence>
}
