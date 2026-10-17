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

/** A progress ring in the brand gradient with a label in the middle. */
export function Ring({ progress, size = 60, stroke = 6, label, labelClass = '' }: { progress: number; size?: number; stroke?: number; label?: ReactNode; labelClass?: string }) {
  const id = useId().replace(/:/g, '')
  const r = size / 2 - stroke / 2 - 1
  const c = 2 * Math.PI * r
  const p = Math.max(0.02, Math.min(1, progress))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9333EA" />
            <stop offset="0.55" stopColor="#EC4899" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#r${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      {label != null && <div className={cx('absolute inset-0 grid place-items-center font-mono font-bold text-gray-900 tabular-nums', labelClass)} style={{ fontSize: size / 4.6 }}>{label}</div>}
    </div>
  )
}

/** A ring that counts down to `to`, full when `from` was. */
export function CountdownRing({ from, to, size = 60 }: { from: number; to: number; size?: number }) {
  const now = useNow(1000)
  const mounted = useMounted()
  const total = Math.max(1, to - from)
  const left = Math.max(0, to - now)
  return <Ring size={size} progress={mounted ? left / total : 1} label={!mounted ? '' : left > 0 ? shortClock(left) : '…'} />
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

const PILL_TONE = {
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
  purple: 'bg-purple-100 text-purple-700',
  darkred: 'bg-red-700 text-white',
}

export function ResultPill({ kind, status, outcome, className = '' }: { kind: 'direction' | 'setup'; status: string; outcome: Outcome; className?: string }) {
  const w = outcomeWord(kind, status, outcome)
  return (
    <span className={cx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black tracking-wide whitespace-nowrap', PILL_TONE[w.tone], className)}>
      {w.tone === 'purple' && <IconLock size={11} weight={2.6} />}
      {w.label}
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
    <span className={cx('inline-flex items-center gap-0.5 font-black', d === 'up' ? 'text-green-600' : 'text-red-600', className)}>
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
  if (p?.rules === 'presage/direction-v1') {
    title = (
      <>
        {p.asset.symbol} <Dir d={p.direction} /> <span className="text-gray-400 font-semibold text-sm">· {p.horizonSec / 3600}h</span>
      </>
    )
    sub = (
      <>
        ${fmtPrice(p.priceAtIssue)}
        {exit != null ? ` → $${fmtPrice(exit)}` : ` · ${p.confidence}% sure`}
        {mine?.myCall ? ` · you said ${mine.myCall}` : ''}
      </>
    )
  } else if (p?.rules === 'presage/setup-v1') {
    const risk = ((p.entry.price - p.stop) / p.entry.price) * 100
    const reward = ((p.target - p.entry.price) / p.entry.price) * 100
    title = (
      <>
        {p.asset.symbol} <span className="text-green-600 font-black">long</span> <span className="text-gray-400 font-semibold text-sm">· setup</span>
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
        <IconLock size={14} weight={2.4} className="text-purple-600" />
        {c.asset ? `${c.asset}${horizon ? ` · ${horizon}` : ''}` : c.paid ? 'A paid question' : c.kind === 'setup' ? 'A sealed setup' : 'A sealed call'}
      </span>
    )
    sub = c.opensAt ? <>opens <At sec={c.opensAt} /></> : <>levels show when it closes</>
  }
  return (
    <Link href={`/calls/${c.id}`} className={cx('flex items-center gap-3 py-3 group', className)}>
      <Sigil id={c.agentId} slug={c.agentSlug === 'oracle' || c.agentSlug === 'st-quant' ? c.agentSlug : undefined} size={40} className="rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[15px] text-black flex items-center gap-1.5 truncate">{title}</div>
        <div className="text-[13px] text-gray-500 tabular-nums truncate">{sub}</div>
      </div>
      <div className="text-right shrink-0">
        <ResultPill kind={c.kind} status={c.status} outcome={c.outcome} />
        {c.result != null && c.outcome !== 'nofill' && (
          <div className={cx('text-sm font-black mt-1 tabular-nums', c.outcome === 'win' ? 'text-green-600' : c.outcome === 'loss' ? 'text-red-600' : 'text-gray-500')}>{resultText(c.kind, c.result)}</div>
        )}
        {c.status === 'sealed' && c.opensAt && (
          <div className="text-xs font-bold text-gray-500 mt-1">
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
  const ringColor = dark ? 'rgba(255,255,255,0.12)' : '#EEF0F3'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible select-none">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9333EA" />
          <stop offset="0.55" stopColor="#EC4899" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <radialGradient id={`s${id}`}>
          <stop offset="0" stopColor="#EC4899" stopOpacity="0.16" />
          <stop offset="1" stopColor="#EC4899" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0.32, 0.6, 0.97].map(k => (
        <circle key={k} cx={R} cy={R} r={R * k - 1} fill="none" stroke={ringColor} strokeWidth={small ? 1 : 1.5} />
      ))}
      {!small && (
        <g className="radar-sweep">
          <path d={`M${R} ${R} L${R} 1 A${R - 1} ${R - 1} 0 0 1 ${R + (R - 1) * Math.sin(0.85)} ${R - (R - 1) * Math.cos(0.85)} Z`} fill={`url(#g${id})`} opacity={dark ? 0.16 : 0.08} />
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
              fill={isSel ? '#111' : dark ? (ring === 'watching' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)') : ring === 'watching' ? '#C7CBD3' : '#E2E5EA'}
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
            <circle cx={x} cy={y} r={dot} fill={firing ? `url(#g${id})` : '#C084FC'} className={firing ? 'glow-pink' : undefined} stroke={isSel ? '#111' : 'none'} strokeWidth={2.5} />
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
                  fontFamily={firing ? 'Inter Tight' : 'Inter'}
                  fontWeight={firing ? 900 : 700}
                  fontSize={firing ? 12.5 : 10.5}
                  fill={dark ? '#fff' : firing ? '#111' : '#7E22CE'}
                  paintOrder="stroke"
                  stroke={dark ? '#030712' : '#fff'}
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

export function CheckRow({ label, ok, note }: { label: string; ok: boolean | null; note?: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className={cx('mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0', ok ? 'bg-green-500 text-white' : ok === false ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-400')}>
        {ok ? <IconCheck size={12} weight={3.2} /> : ok === false ? <IconX size={11} weight={3} /> : <span className="text-[10px] font-black">?</span>}
      </span>
      <div className="min-w-0">
        <div className={cx('text-sm font-bold', ok ? 'text-black' : 'text-gray-600')}>{label}</div>
        {note && <div className="text-xs text-gray-500">{note}</div>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- the feed, in plain words */

type Told = { text: ReactNode; detail?: string; href?: string; tone: 'green' | 'red' | 'purple' | 'blue' | 'gray'; chart?: string | null }

/** What happened, in words a person would use. Scans and near-misses live on the radar, not here. */
export function tell(e: AgentEvent): Told | null {
  const d = e.data as Record<string, unknown>
  const sym = typeof d.symbol === 'string' ? d.symbol : null
  const who = <b className="font-bold text-black">{e.agentName}</b>
  switch (e.kind) {
    case 'sealed':
      return { text: <>{who} sealed a {d.kind === 'setup' ? 'setup' : 'call'}{sym ? <> on <b className="text-black">{sym}</b></> : ''}</>, detail: e.masked ? 'The levels open to everyone when it closes.' : undefined, href: `/calls/${d.callId}`, tone: 'purple' }
    case 'resolved': {
      const kind = d.kind === 'setup' ? 'setup' : 'direction'
      if (d.outcome === 'nofill')
        return {
          text: (
            <>
              {who}’s <b className="text-black">{sym}</b> setup expired unfilled
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
            {who}’s <b className="text-black">{sym}</b> {kind === 'setup' ? 'setup' : 'call'} opened: <b className={w.tone === 'green' ? 'text-green-600' : w.tone === 'red' ? 'text-red-600' : 'text-gray-600'}>{w.label.toLowerCase()}</b> {resultText(kind, Number(d.result))}
          </>
        ),
        href: `/calls/${d.callId}`,
        tone: w.tone === 'green' ? 'green' : w.tone === 'red' ? 'red' : 'gray',
      }
    }
    case 'answered':
      if (e.masked)
        return {
          text: d.paid ? <>{who} answered a paid question</> : <>{who} called <b className="text-black">{sym}</b> for the next {String(d.horizon)}</>,
          detail: 'Sealed on Metis. It opens when the time is up.',
          href: `/calls/${d.callId}`,
          tone: 'blue',
        }
      return { text: <>{who} called <b className="text-black">{sym}</b> {String(d.direction)} · {String(d.horizon)}</>, href: `/calls/${d.callId}`, tone: 'blue' }
    case 'chart_read': {
      const v = String(d.verdict)
      return {
        text: (
          <>
            {who} read {sym ? <>the <b className="text-black">{sym}</b> chart</> : 'a chart'}: <b className={v === 'BUY' ? 'text-green-600' : 'text-gray-700'}>{v === 'BUY' ? 'looks right' : v === 'WAIT' ? 'not yet' : 'no'}</b>
          </>
        ),
        detail: typeof d.plain === 'string' && d.plain ? d.plain : typeof d.why === 'string' ? d.why : undefined,
        tone: v === 'BUY' ? 'green' : 'gray',
        chart: typeof d.chart === 'string' ? d.chart : null,
      }
    }
    case 'skipped':
      if (typeof d.why === 'string' && /no chart read available/.test(d.why)) return null
      return { text: <>{who} passed on {sym ? <b className="text-black">{sym}</b> : 'a setup'}</>, detail: typeof d.why === 'string' ? d.why : undefined, tone: 'gray' }
    case 'forfeited':
      return { text: <>{who} missed a reveal</>, detail: 'It counts as a loss, and the payer is refunded.', href: `/calls/${d.callId}`, tone: 'red' }
    default:
      return null
  }
}

const DOT = { green: 'bg-green-500', red: 'bg-red-500', purple: 'bg-purple-500', blue: 'bg-blue-500', gray: 'bg-gray-300' }

export function FeedItem({ e, now, compact = false }: { e: AgentEvent; now: number; compact?: boolean }) {
  const t = tell(e)
  if (!t) return null
  const body = (
    <div className="flex gap-3 py-3">
      <div className="relative shrink-0">
        <Sigil id={e.agentId} slug={e.agentSlug === 'oracle' || e.agentSlug === 'st-quant' ? e.agentSlug : undefined} size={32} className="rounded-lg" />
        <span className={cx('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white', DOT[t.tone])} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-gray-700 leading-snug">{t.text}</div>
        {t.detail && <div className="text-[12.5px] text-gray-500 mt-0.5 line-clamp-2">{t.detail}</div>}
        {t.chart &&
          (compact ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/charts/read/${t.chart}`} alt="the chart it read" className="mt-2 rounded-lg border border-gray-100 h-14 w-24 object-cover object-left-top" loading="lazy" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/charts/read/${t.chart}`} alt="the chart it read" className="mt-2 rounded-xl border border-gray-100 w-full max-w-sm" loading="lazy" />
          ))}
      </div>
      <div className="text-[11px] font-semibold text-gray-400 whitespace-nowrap pt-0.5">{ago(now - e.at)}</div>
    </div>
  )
  return t.href ? (
    <Link href={t.href} className="block hover:bg-gray-50/80 -mx-2 px-2 rounded-xl transition-colors">
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
  if (!shown.length) return <div className="text-sm text-gray-500 py-6 text-center">{empty}</div>
  return (
    <div className="divide-y divide-gray-100">
      {shown.map(e => (
        <FeedItem key={e.id} e={e} now={now} compact={compact} />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- status */

const STATUS_DOT: Record<AgentStatus['state'], string> = {
  scanning: 'bg-blue-500',
  reading: 'bg-purple-500',
  sealed: 'bg-purple-600',
  answering: 'bg-blue-500',
  waiting: 'bg-green-500',
  idle: 'bg-gray-300',
  offline: 'bg-red-500',
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

export function Panel({ children, className = '', tone = 'white', as: As = 'section' }: { children: ReactNode; className?: string; tone?: 'white' | 'dark' | 'grad' | 'soft'; as?: 'section' | 'div' }) {
  const t = { white: 'bg-white border-2 border-gray-100', dark: 'bg-gray-950 text-white', grad: 'grad-border', soft: 'bg-gray-50' }[tone]
  return <As className={cx('rounded-3xl', t, className)}>{children}</As>
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-[11px] font-black tracking-[0.14em] uppercase', className || 'text-gray-400')}>{children}</div>
}

export function PanelHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-lg md:text-xl font-black tracking-tight text-black">{title}</h2>
        {sub && <div className="text-[13px] text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/** The big primary action. On phones it can float just above the tab bar. */
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
  tone?: 'black' | 'grad' | 'white'
  disabled?: boolean
  className?: string
}) {
  const cls = cx(
    'h-14 w-full rounded-2xl font-bold text-[16px] grid place-items-center px-5 transition-all active:scale-[0.99]',
    tone === 'black' && 'bg-black text-white hover:bg-gray-800 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)]',
    tone === 'grad' && 'grad text-white shadow-[0_10px_30px_-10px_rgba(236,72,153,0.6)] hover:brightness-110',
    tone === 'white' && 'bg-white text-black border-2 border-gray-200 hover:border-black',
    disabled && 'opacity-50 pointer-events-none',
    className,
  )
  if (href) return <Link href={href} className={cls}>{children}</Link>
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {children}
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
        className="fixed z-[61] inset-x-0 bottom-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[560px] bg-white rounded-t-[28px] md:rounded-3xl max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1.5 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 md:px-6 pt-4 md:pt-6">
          <div className="font-heading text-xl font-black">{title}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 grid place-items-center text-gray-600" aria-label="Close">
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
