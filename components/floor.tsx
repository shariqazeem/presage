'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { AgentEvent, AgentStatus, RadarRow } from '@/lib/floor-types'
import { ago, result } from '@/lib/client/format'
import { Pill, cx } from './ui'

/** One event in words, with a link where there is somewhere to go. */
export function describeEvent(e: AgentEvent): { icon: string; text: string; detail?: string; href?: string; tone: 'default' | 'green' | 'red' | 'purple' | 'blue' } {
  const d = e.data as Record<string, string | number | boolean | string[] | undefined>
  const sym = typeof d.symbol === 'string' ? d.symbol : null
  switch (e.kind) {
    case 'scan':
      return d.phase === 'start'
        ? { icon: '🔍', text: `is scanning ${d.markets} markets`, tone: 'blue' }
        : { icon: '📡', text: `scanned ${d.markets} markets`, detail: `${d.candidates ?? 0} setups, ${d.sealed ?? 0} sealed, ${Math.round(Number(d.ms ?? 0) / 1000)}s`, tone: 'default' }
    case 'candidate':
      return { icon: '🎯', text: sym ? `found a setup on ${sym}` : 'found a setup', detail: `${d.route === 'armed' ? 'armed plan' : 'sniper fired'}${d.score != null ? `, score ${d.score}` : ''}${e.masked ? ' · the coin shows when the call is revealed' : ''}`, tone: 'purple' }
    case 'chart_read':
      return { icon: '👁️', text: sym ? `read the chart on ${sym}: ${d.verdict} ${d.conviction}/5` : `read a chart: ${d.verdict} ${d.conviction}/5`, detail: typeof d.why === 'string' ? d.why : undefined, tone: d.verdict === 'BUY' ? 'green' : 'default' }
    case 'sealed':
      return { icon: '🔒', text: sym ? `sealed call #${d.chainCallId} on ${sym}` : `sealed call #${d.chainCallId}`, detail: e.masked ? 'levels are for subscribers until it resolves' : undefined, href: `/calls/${d.callId}`, tone: 'purple' }
    case 'resolved': {
      const o = String(d.outcome)
      return { icon: o === 'win' ? '🔓' : o === 'loss' ? '🔓' : '🔓', text: `call #${d.chainCallId} on ${sym}: ${o.toUpperCase()} ${result(d.kind === 'setup' ? 'setup' : 'direction', Number(d.result))}`, href: `/calls/${d.callId}`, tone: o === 'win' ? 'green' : o === 'loss' ? 'red' : 'default' }
    }
    case 'forfeited':
      return { icon: '🚫', text: `forfeited call #${d.chainCallId}`, detail: 'not revealed in time, counts as a loss', href: `/calls/${d.callId}`, tone: 'red' }
    case 'answered':
      return { icon: '🔮', text: `${d.paid ? 'answered' : 'called'} ${sym} ${d.horizon}: ${String(d.direction).toUpperCase()} ${d.confidence}%`, detail: `${d.voters} voters${d.paid ? ' · paid over x402' : ' · scheduled'}`, href: `/calls/${d.callId}`, tone: 'blue' }
    case 'skipped':
      return { icon: '⏸️', text: 'passed on a setup', detail: typeof d.why === 'string' ? d.why : undefined, tone: 'default' }
    default:
      return { icon: '·', text: e.kind, tone: 'default' }
  }
}

const TONE_BG = { default: 'bg-white', green: 'bg-green-50', red: 'bg-red-50', purple: 'bg-purple-50', blue: 'bg-blue-50' }

export function EventLine({ e, showAgent = true, compact = false }: { e: AgentEvent; showAgent?: boolean; compact?: boolean }) {
  const v = describeEvent(e)
  const chart = typeof e.data.chart === 'string' ? e.data.chart : null
  const body = (
    <div className={cx('flex gap-3 rounded-xl border border-gray-200 transition-all', TONE_BG[v.tone], compact ? 'p-3' : 'p-4', v.href && 'hover:border-gray-400 hover:shadow-sm')}>
      <div className={cx('shrink-0', compact ? 'text-lg' : 'text-2xl')}>{v.icon}</div>
      <div className="min-w-0 flex-1">
        <div className={cx('text-gray-900 leading-snug', compact ? 'text-sm' : 'text-[15px]')}>
          {showAgent &&
            (v.href ? (
              <span className="font-bold">{e.agentName}</span>
            ) : (
              <Link href={`/agents/${e.agentSlug}`} className="font-bold hover:underline">
                {e.agentName}
              </Link>
            ))}{' '}
          {v.text}
        </div>
        {v.detail && <div className={cx('text-gray-500 mt-0.5', compact ? 'text-xs line-clamp-2' : 'text-sm')}>{v.detail}</div>}
        {chart && !compact && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/charts/read/${chart}`} alt="the chart it read" className="mt-3 rounded-lg border border-gray-200 w-full max-w-md" loading="lazy" />
        )}
      </div>
      <div className="text-xs text-gray-400 whitespace-nowrap">{ago(e.at)}</div>
    </div>
  )
  return v.href ? <Link href={v.href}>{body}</Link> : body
}

export function EventFeed({ events, showAgent = true, compact = false, max = 60 }: { events: AgentEvent[]; showAgent?: boolean; compact?: boolean; max?: number }) {
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {events.slice(0, max).map(e => (
          <motion.div key={e.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <EventLine e={e} showAgent={showAgent} compact={compact} />
          </motion.div>
        ))}
      </AnimatePresence>
      {events.length === 0 && <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-6 text-center border border-gray-200">Nothing yet. The agents report here the moment they move.</div>}
    </div>
  )
}

const STATUS_STYLE: Record<AgentStatus['state'], { dot: string; tone: 'green' | 'blue' | 'purple' | 'gray' | 'yellow' }> = {
  scanning: { dot: 'bg-blue-500', tone: 'blue' },
  reading: { dot: 'bg-purple-500', tone: 'purple' },
  sealed: { dot: 'bg-purple-600', tone: 'purple' },
  answering: { dot: 'bg-blue-500', tone: 'blue' },
  waiting: { dot: 'bg-green-500', tone: 'green' },
  idle: { dot: 'bg-gray-400', tone: 'gray' },
  offline: { dot: 'bg-red-500', tone: 'gray' },
}

export function StatusChip({ status, engineUp = true }: { status: AgentStatus; engineUp?: boolean }) {
  const s = engineUp ? STATUS_STYLE[status.state] : STATUS_STYLE.offline
  const live = engineUp && status.state !== 'idle'
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
      <span className="relative inline-flex w-2.5 h-2.5">
        {live && <span className={cx('absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping', s.dot)} />}
        <span className={cx('relative inline-flex w-2.5 h-2.5 rounded-full', s.dot)} />
      </span>
      <span className="truncate">{engineUp ? status.line : 'Engine offline'}</span>
      <span className="text-xs text-gray-400">{ago(status.at)}</span>
    </span>
  )
}

const STATE_PILL: Record<RadarRow['state'], { label: string; tone: 'gray' | 'blue' | 'yellow' | 'gradient' }> = {
  quiet: { label: 'quiet', tone: 'gray' },
  watching: { label: 'watching', tone: 'blue' },
  close: { label: 'close', tone: 'yellow' },
  firing: { label: 'firing', tone: 'gradient' },
}

/** The radar: every market an agent watches, closest to firing first. */
export function RadarTable({ rows, limit, compact = false }: { rows: RadarRow[]; limit?: number; compact?: boolean }) {
  const shown = limit ? rows.slice(0, limit) : rows
  if (!rows.length) return <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-6 text-center border border-gray-200">The radar fills in after the first scan.</div>
  return (
    <div className="overflow-x-auto -mx-1">
      <table className={cx('w-full text-sm', !compact && 'min-w-[760px]')}>
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="px-2 py-2 font-semibold">Market</th>
            <th className="px-2 py-2 font-semibold">State</th>
            <th className="px-2 py-2 font-semibold text-right">15m MFI</th>
            {!compact && <th className="px-2 py-2 font-semibold text-right">1h MFI</th>}
            {!compact && <th className="px-2 py-2 font-semibold text-right">Support</th>}
            {!compact && <th className="px-2 py-2 font-semibold text-right">ATR</th>}
            <th className="px-2 py-2 font-semibold text-right">Score</th>
            {!compact && <th className="px-2 py-2 font-semibold w-[30%]">Holding it back</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map(r => {
            const st = STATE_PILL[r.state]
            return (
              <tr key={r.ref || Math.random()} className={cx('border-t border-gray-100', r.state === 'firing' && 'bg-purple-50/60', r.state === 'close' && 'bg-yellow-50/50')}>
                <td className="px-2 py-2 font-bold text-black whitespace-nowrap">
                  {r.symbol ?? <span className="text-gray-400">🔒 hidden</span>}
                  <span className="ml-1 text-[10px] font-semibold text-gray-400 uppercase">{r.source === 'binance' ? '' : r.ref.split(':')[0]}</span>
                </td>
                <td className="px-2 py-2">
                  <Pill tone={st.tone} pulse={r.state === 'firing'}>
                    {st.label}
                  </Pill>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.mfi15 ?? '—'}
                  {r.mfi15Pct != null && <span className={cx('ml-1 text-xs', r.mfi15Pct <= 15 ? 'text-green-700 font-bold' : 'text-gray-400')}>p{r.mfi15Pct}</span>}
                </td>
                {!compact && (
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.mfi1h ?? '—'}
                    {r.mfi1hPct != null && <span className={cx('ml-1 text-xs', r.mfi1hPct <= 15 ? 'text-green-700 font-bold' : 'text-gray-400')}>p{r.mfi1hPct}</span>}
                  </td>
                )}
                {!compact && (
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                    {r.supportDistPct == null ? <span className="text-gray-400">none near</span> : <span className={r.supportDistPct <= 2.5 ? 'text-green-700 font-bold' : ''}>{r.supportDistPct}% above</span>}
                    {r.supportKind && <span className="ml-1 text-xs text-gray-400">{r.supportKind}</span>}
                  </td>
                )}
                {!compact && <td className="px-2 py-2 text-right tabular-nums text-gray-600">{r.atrPct}%</td>}
                <td className="px-2 py-2 text-right tabular-nums font-bold">{r.score}</td>
                {!compact && (
                  <td className="px-2 py-2 text-xs text-gray-500" title={r.blocker ?? ''}>
                    <span className="block truncate max-w-[280px]">{r.blocker ?? (r.state === 'firing' ? 'nothing: this is a setup' : '')}</span>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {!compact && (
        <div className="text-[11px] text-gray-400 mt-2 px-2">
          MFI is money flow. p = where the latest reading sits among its last 100: p5 is lower than 95% of them. Support is the nearest level at or below price that the rules found.
        </div>
      )}
    </div>
  )
}
