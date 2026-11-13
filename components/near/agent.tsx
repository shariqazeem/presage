'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { IconCheck, IconExternal, IconX } from '../icons'
import { useNow } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { nearTxUrl } from '@/lib/near/config'
import type { AgentState, CoinRead } from '@/lib/near/hooks'
import type { FeedLine } from '@/lib/near/store'
import { ago, money } from './kit'

/* ---------------------------------------------------------------- who's who */

export const AGENTS = {
  parallaxpay: { name: 'ParallaxPay', role: 'Trader', line: 'Reads the chart and trades for members, inside their rules.' },
  analyst: { name: 'Analyst', role: 'NEAR AI, in a TEE', line: 'Checks every setup against the same rubric and signs its answer.' },
} as const

/** The analyst's mark: an eye, in the same black tile and foil as the ParallaxPay mark. */
function AnalystMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={`an-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.45" stopColor="#EC4899" />
          <stop offset="0.8" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0A0A0A" />
      <path d="M12 32 C20 20 44 20 52 32 C44 44 20 44 12 32 Z" fill="none" stroke={`url(#an-${size})`} strokeWidth="5" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="6.5" fill="#FFFFFF" />
    </svg>
  )
}

const hue = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)

/** Agents get their mark; people get a colour from their account name, the same every time. */
export function Avatar({ actor, size = 32 }: { actor: string | null; size?: number }) {
  if (actor === 'parallaxpay' || actor === 'st-quant') return <Mark size={size} />
  if (actor === 'analyst') return <AnalystMark size={size} />
  if (!actor) return <span className="rounded-full bg-paper-2 shrink-0 inline-block" style={{ width: size, height: size }} />
  const h = hue(actor)
  return (
    <span
      className="rounded-full shrink-0 grid place-items-center font-heading font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 50) % 360} 75% 45%))` }}
    >
      {actor.replace(/\.near$|\.tg$/, '').slice(0, 1).toUpperCase()}
    </span>
  )
}

export function actorName(actor: string | null): string {
  if (actor === 'st-quant') return AGENTS.parallaxpay.name
  if (actor && actor in AGENTS) return AGENTS[actor as keyof typeof AGENTS].name
  if (!actor) return 'ParallaxPay'
  return actor.length > 22 ? `${actor.slice(0, 8)}…${actor.slice(-6)}` : actor
}

/* ---------------------------------------------------------------- the floor */

/** Agents and people in one stream: what ParallaxPay sees and does, what the analyst says, who joined and traded. */
export function Floor({ lines, max = 20, dark = false, showMine = true, empty = 'Quiet for now. ParallaxPay re-reads the market every 15 minutes.' }: { lines: FeedLine[]; max?: number; dark?: boolean; showMine?: boolean; empty?: string }) {
  const now = useNow(30_000)
  if (!lines.length) return <p className={cx('text-[14px] py-6', dark ? 'text-[#8A8A92]' : 'text-ink-3')}>{empty}</p>
  // It re-reads every coin it trades; only its latest read of a coin stays on the floor, and only a few
  // of those, so setups, trades and people aren't buried under routine reads.
  const seen = new Set<string>()
  const shown = lines.filter(l => {
    if (l.kind !== 'watch') return true
    const k = l.coin ?? ''
    if (seen.has(k) || seen.size >= 3) return false
    seen.add(k)
    return true
  })
  return (
    <ol>
      <AnimatePresence initial={false}>
        {shown.slice(0, max).map(l => {
          const actor = l.actor ?? (l.kind === 'member' ? null : 'parallaxpay')
          // An actor's name opens their line; a member's own move already starts with their account.
          const startsWithName = actor != null && l.text.startsWith(actor)
          return (
            <motion.li key={l.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={cx('flex gap-3 py-3 border-b last:border-0', dark ? 'border-white/[0.06]' : 'border-line')}>
              <Avatar actor={actor} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cx('text-[13px] font-semibold truncate', dark ? 'text-white' : 'text-ink')}>{actorName(actor)}</span>
                  {actor === 'analyst' && <span className="label !text-[9px] text-ink-3">NEAR AI</span>}
                  {showMine && l.mine && <span className="label !text-[9px] px-1.5 py-0.5 rounded-full bg-paper-2 text-ink-2">for you</span>}
                  <span className={cx('ml-auto num text-[11px] shrink-0', dark ? 'text-[#6B6B72]' : 'text-ink-3')}>{ago(l.at, now)}</span>
                </div>
                <p className={cx('text-[14px] leading-snug mt-0.5', dark ? 'text-[#E6E6E3]' : 'text-ink-2')}>{startsWithName ? l.text.slice(actor!.length).replace(/^\s*/, '').replace(/^./, c => c.toUpperCase()) : l.text}</p>
                {l.tx && (
                  <a href={nearTxUrl(l.tx)} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-1 text-[12px] mt-1 underline underline-offset-2', dark ? 'text-[#8A8A92] decoration-white/20' : 'text-ink-3 decoration-line')}>
                    on NEAR <IconExternal size={11} />
                  </a>
                )}
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}

/* ---------------------------------------------------------------- the checklist */

export function Checklist({ r, dark = true, compact = false }: { r: CoinRead; dark?: boolean; compact?: boolean }) {
  const checks = r.checks ?? []
  const passed = checks.filter(c => c.ok).length
  return (
    <div>
      <div className={cx('flex items-center justify-between label !text-[9.5px]', dark ? 'text-[#8A8A92]' : 'text-ink-3')}>
        <span>Its checklist</span>
        <span className="num">
          {passed}/{checks.length}
        </span>
      </div>
      <ul className="mt-2 grid gap-1.5">
        {checks.map(c => (
          <li key={c.key} className="flex items-start gap-2.5">
            <span
              className={cx(
                'mt-[2px] w-[18px] h-[18px] rounded-full grid place-items-center shrink-0',
                c.ok == null ? (dark ? 'bg-white/10 text-[#8A8A92]' : 'bg-paper-2 text-ink-3') : c.ok ? (dark ? 'bg-up-d text-ink' : 'bg-up text-white') : dark ? 'bg-white/10 text-down-d' : 'bg-down/10 text-down',
              )}
            >
              {c.ok == null ? <span className="w-1 h-1 rounded-full bg-current" /> : c.ok ? <IconCheck size={11} weight={3} /> : <IconX size={10} weight={3} />}
            </span>
            <div className="min-w-0">
              <div className={cx('text-[13px] leading-tight', dark ? 'text-white' : 'text-ink')}>{c.label}</div>
              {!compact && <div className={cx('text-[11.5px] leading-snug mt-0.5', dark ? 'text-[#8A8A92]' : 'text-ink-3')}>{c.note}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- the desk */

/** The sentence without its leading "NEAR $3.84," since the desk shows both already. */
export function withoutPrice(r: CoinRead): string {
  const rest = r.line.replace(new RegExp(`^${r.coin} \\$[\\d,.]+[,:]?\\s*`), '')
  return rest ? rest[0].toUpperCase() + rest.slice(1) : r.line
}

export function StatStrip({ agent }: { agent: AgentState | undefined }) {
  const rec = agent?.record
  const items = [
    { v: agent?.vault?.members ?? '—', k: 'members' },
    { v: rec?.closed ?? 0, k: 'trades closed' },
    { v: rec?.closed ? `${Math.round((rec.wins / rec.closed) * 100)}%` : '—', k: 'won' },
    { v: rec?.closed ? money(rec.pnlUsd, { sign: true }) : '—', k: 'profit, losses included', tone: rec && rec.closed ? (rec.pnlUsd >= 0 ? 'text-up' : 'text-down') : '' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(i => (
        <div key={i.k}>
          <div className={cx('num text-[20px] md:text-[24px] font-semibold leading-none', i.tone)}>{i.v}</div>
          <div className="text-[11.5px] md:text-[12.5px] text-ink-3 mt-1.5">{i.k}</div>
        </div>
      ))}
    </div>
  )
}

export function AgentCard({ id }: { id: keyof typeof AGENTS }) {
  const a = AGENTS[id]
  return (
    <Link href="/how-it-trades" className="flex items-center gap-3 rounded-[16px] border border-line bg-white p-3.5 hover:border-ink-3 transition-colors">
      <Avatar actor={id} size={40} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[15px]">{a.name}</span>
          <span className="label !text-[9px] text-ink-3">{a.role}</span>
        </div>
        <div className="text-[13px] text-ink-3 leading-snug">{a.line}</div>
      </div>
    </Link>
  )
}
