'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { IconCheck, IconExternal, IconLock, IconUnlock } from '../icons'
import { SealedChip, useNow } from '../kit'
import { cx } from '../ui'
import { nearTxUrl } from '@/lib/near/config'
import type { CoinRead } from '@/lib/near/hooks'
import type { FeedLine, PositionView } from '@/lib/near/store'
import { useNear } from './NearWallet'

export function money(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = opts.sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : ''
  const a = Math.abs(n)
  const body = a >= 1000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a >= 1 ? a.toFixed(2) : a.toFixed(a >= 0.01 ? 3 : 4)
  return `${sign}$${body}`
}

/** Account money: always to the cent, like a bank or exchange balance. `trim` drops a trailing .00 inside sentences. */
export function usd(n: number | null | undefined, opts: { sign?: boolean; trim?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const cents = Math.round(n * 100) / 100
  const sign = opts.sign ? (cents > 0 ? '+' : cents < 0 ? '−' : '') : cents < 0 ? '−' : ''
  const body = Math.abs(cents).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${opts.trim && body.endsWith('.00') ? body.slice(0, -3) : body}`
}

export const pctText = (p: number | null | undefined) => (p == null ? '—' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p * 100).toFixed(1)}%`)

export function qty(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (n >= 1) return n.toFixed(3)
  return Number(n.toPrecision(4)).toString()
}

export function ago(sec: number, now: number): string {
  const d = Math.max(0, now - sec)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86_400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86_400)}d ago`
}

export function TxLink({ hash, children, className = '' }: { hash: string | null | undefined; children?: ReactNode; className?: string }) {
  if (!hash) return null
  return (
    <a href={nearTxUrl(hash)} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-1 underline decoration-line underline-offset-2 hover:decoration-ink', className)}>
      {children ?? `${hash.slice(0, 6)}…`}
      <IconExternal size={12} />
    </a>
  )
}

/** Connect a NEAR wallet, or once connected, the account with a small menu. */
export function NearButton({ variant = 'nav', label = 'Connect NEAR wallet', className = '' }: { variant?: 'nav' | 'full'; label?: string; className?: string }) {
  const { accountId, ready, connect, disconnect } = useNear()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const size = variant === 'full' ? 'h-[54px] px-6 text-base w-full rounded-[14px]' : 'h-10 px-4 text-sm rounded-[12px]'
  if (!ready) return <div className={cx(variant === 'full' ? 'h-[54px] w-full' : 'h-10 w-32', 'rounded-[14px] bg-paper-2 animate-pulse')} aria-hidden />
  if (!accountId) {
    return (
      <button
        onClick={async () => {
          setBusy(true)
          await connect().catch(() => {})
          setBusy(false)
        }}
        disabled={busy}
        className={cx('bg-ink text-white font-semibold hover:bg-[#26262A] active:scale-[0.98] transition-all disabled:opacity-60', size, className)}
      >
        {busy ? 'Opening wallets…' : label}
      </button>
    )
  }
  return (
    <div className={cx('relative', variant === 'full' && 'w-full', className)}>
      <button onClick={() => setOpen(o => !o)} className={cx('border border-line bg-white font-semibold text-ink hover:border-ink transition-colors flex items-center gap-2', size)}>
        <span className="w-2 h-2 rounded-full bg-up" />
        <span className="num truncate max-w-[180px]">{accountId}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-line rounded-[14px] shadow-xl p-1.5 z-50">
          <button onClick={() => navigator.clipboard?.writeText(accountId).then(() => setOpen(false))} className="w-full text-left px-3 py-2.5 rounded-[10px] text-[14px] hover:bg-paper-2">
            Copy account name
          </button>
          <button
            onClick={async () => {
              setOpen(false)
              await disconnect()
            }}
            className="w-full text-left px-3 py-2.5 rounded-[10px] text-[14px] text-down hover:bg-paper-2"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

const STATE = {
  setup: { label: 'Setup', cls: 'foil text-white' },
  armed: { label: 'Armed', cls: 'bg-white text-ink' },
  close: { label: 'Close', cls: 'bg-white/15 text-white' },
  watching: { label: 'Watching', cls: 'bg-white/10 text-[#C9C9CF]' },
} as const

export function readState(r: CoinRead): keyof typeof STATE {
  if (r.setup) return 'setup'
  if (r.armedAt) return 'armed'
  if (r.supportDistPct != null && r.supportDistPct >= 0 && r.supportDistPct <= 2.5 && (r.mfi1hPct ?? 100) <= 25) return 'close'
  return 'watching'
}

/** Momentum in its own recent range: the agent only buys near the bottom. */
function MomentumBar({ pct, label }: { pct: number | null; label: string }) {
  return (
    <div>
      <div className="flex justify-between label !text-[9.5px] text-[#8A8A92]">
        <span>{label}</span>
        <span className="num">{pct == null ? '—' : `${pct}%`}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-[15%] bg-white/10" />
        {pct != null && <motion.span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white" initial={false} animate={{ left: `calc(${Math.min(100, Math.max(0, pct))}% - 5px)` }} />}
      </div>
    </div>
  )
}

/** The feed line without its leading "NEAR $3.84," since the card shows both already. */
function withoutPrice(r: CoinRead): string {
  const rest = r.line.replace(new RegExp(`^${r.coin} \\$[\\d,.]+[,:]?\\s*`), '')
  return rest ? rest[0].toUpperCase() + rest.slice(1) : r.line
}

/** What the agent sees on one coin right now. Dark, because it's live. */
export function CoinCard({ r }: { r: CoinRead }) {
  const state = readState(r)
  const s = STATE[state]
  return (
    <div className="rounded-[18px] bg-[#151517] border border-[#26262A] p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-heading text-[22px] font-black tight text-white">{r.coin}</span>
          <span className="num text-[15px] text-[#C9C9CF]">{money(r.price)}</span>
        </div>
        <span className={cx('label !text-[9.5px] px-2.5 py-1 rounded-full', s.cls)}>{s.label}</span>
      </div>
      <p className="text-[14px] leading-snug text-[#E6E6E3] mt-3 min-h-[40px]">{withoutPrice(r)}</p>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <MomentumBar pct={r.mfi1hPct} label="1H momentum" />
        <MomentumBar pct={r.mfi15Pct} label="15m momentum" />
      </div>
      <div className="mt-3.5 flex items-center justify-between text-[12px] text-[#8A8A92]">
        <span>{r.support ? `Support ${money(r.support.price)} · ${r.support.tf}` : 'No support close'}</span>
        <span className="num">{r.supportDistPct == null ? '' : `${r.supportDistPct >= 0 ? '' : '+'}${Math.abs(r.supportDistPct).toFixed(1)}% ${r.supportDistPct >= 0 ? 'above it' : 'under it'}`}</span>
      </div>
    </div>
  )
}

const KIND: Record<string, { dot: string; word: string }> = {
  watch: { dot: 'bg-ink-3', word: 'Watching' },
  setup: { dot: 'foil', word: 'Setup' },
  pass: { dot: 'bg-ink-3', word: 'Passed' },
  enter: { dot: 'bg-up', word: 'Bought' },
  exit: { dot: 'bg-ink', word: 'Sold' },
  propose: { dot: 'foil', word: 'For you' },
  seal: { dot: 'foil', word: 'Sealed' },
  reveal: { dot: 'bg-ink', word: 'Opened' },
  note: { dot: 'bg-ink-3', word: 'Note' },
  error: { dot: 'bg-down', word: 'Problem' },
}

export function FeedList({ lines, empty = 'Quiet for now. The agent checks the market every 15 minutes.', max = 30 }: { lines: FeedLine[]; empty?: string; max?: number }) {
  const now = useNow(30_000)
  if (!lines.length) return <p className="text-[14px] text-ink-3 py-6">{empty}</p>
  return (
    <ol className="divide-y divide-line">
      {lines.slice(0, max).map(l => {
        const k = KIND[l.kind] ?? KIND.note
        return (
          <li key={l.id} className="py-3 flex gap-3">
            <span className={cx('mt-[7px] w-2 h-2 rounded-full shrink-0', k.dot)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 label !text-[9.5px] text-ink-3">
                <span>{k.word}</span>
                {l.mine && <span className="px-1.5 py-0.5 rounded-full bg-paper-2 text-ink-2">You</span>}
                <span className="ml-auto num normal-case tracking-normal">{ago(l.at, now)}</span>
              </div>
              <p className="text-[14px] leading-snug text-ink mt-1">{l.text}</p>
              {l.tx && <TxLink hash={l.tx} className="text-[12px] text-ink-3 mt-1">On NEAR</TxLink>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Where price sits between the stop and the target. */
export function StopTargetBar({ stop, target, entry, now }: { stop: number; target: number; entry: number | null; now: number | null }) {
  if (!stop || !target || target <= stop) return null
  const at = (p: number) => `${Math.min(100, Math.max(0, ((p - stop) / (target - stop)) * 100))}%`
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-down/25 via-paper-2 to-up/30">
        {entry != null && <span className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4 bg-ink-3" style={{ left: at(entry) }} title="entry" />}
        {now != null && <span className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-ink ring-2 ring-white" style={{ left: `calc(${at(now)} - 6px)` }} />}
      </div>
      <div className="flex justify-between mt-1.5 text-[11.5px] num text-ink-3">
        <span>stop {money(stop)}</span>
        <span>target {money(target)}</span>
      </div>
    </div>
  )
}

const STATUS_WORD: Record<PositionView['status'], string> = { proposed: 'Waiting for you', open: 'Open', closed: 'Closed', not_filled: "Didn't fill", declined: 'Not taken' }

export function PositionCard({ p, price, action }: { p: PositionView; price?: number | null; action?: ReactNode }) {
  const live = p.status === 'open' && price != null && p.coinAmount != null ? p.coinAmount * price - p.usdcIn : null
  const pnl = p.status === 'closed' ? p.pnlUsd : live
  const pnlPct = p.status === 'closed' ? p.pnlPct : live != null && p.usdcIn > 0 ? live / p.usdcIn : null
  return (
    <div className="rounded-[18px] border border-line bg-white p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-heading text-[20px] font-black tight">{p.coin}</span>
            <span className="label !text-[9.5px] text-ink-3">{STATUS_WORD[p.status]}</span>
          </div>
          <div className="text-[13px] text-ink-3 mt-0.5">
            {money(p.usdcIn)} in{p.entryPrice ? ` at ${money(p.entryPrice)}` : ''}
            {p.exitPrice ? ` · out at ${money(p.exitPrice)}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className={cx('num text-[18px] font-semibold', pnl == null ? 'text-ink-3' : pnl >= 0 ? 'text-up' : 'text-down')}>{money(pnl, { sign: true })}</div>
          <div className="num text-[12px] text-ink-3">{pctText(pnlPct)}</div>
        </div>
      </div>
      {p.status === 'open' && <StopTargetBar stop={p.stop} target={p.target} entry={p.entryPrice} now={price ?? null} />}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {p.callId != null && (p.opened ? <span className="inline-flex items-center gap-1"><IconUnlock size={13} /> Plan #{p.callId} opened</span> : <span className="inline-flex items-center gap-1"><IconLock size={13} /> Plan #{p.callId} sealed</span>)}
        {p.exitReason && p.status !== 'open' && <span>{p.exitReason}</span>}
        <Link href={`/record/${p.id}`} className="ml-auto underline decoration-line underline-offset-2 hover:decoration-ink">Receipt</Link>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="w-8 h-8 rounded-full bg-ink text-white grid place-items-center num text-[13px] shrink-0">{n}</span>
      <div>
        <div className="font-heading text-[17px] font-black tight">{title}</div>
        <p className="text-[14px] text-ink-2 leading-snug mt-1">{children}</p>
      </div>
    </div>
  )
}

export function Verified({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[14px]">
      <span className={cx('mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0', ok == null ? 'bg-paper-2 text-ink-3' : ok ? 'bg-up text-white' : 'bg-down text-white')}>
        {ok == null ? <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-pulse" /> : ok ? <IconCheck size={12} weight={3} /> : <span className="text-[11px] font-bold">!</span>}
      </span>
      <span className="text-ink-2 leading-snug">{children}</span>
    </div>
  )
}

export { SealedChip }
