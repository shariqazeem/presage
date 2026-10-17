'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { Share } from '@/components/Share'
import { cx } from '@/components/ui'
import { PingButton } from '@/components/Ping'
import { IconCheck, IconLock, IconX } from '@/components/icons'
import { CountdownRing, Eyebrow, Panel, ResultPill, outcomeWord } from '@/components/kit'
import { VoteBoard } from '@/components/oracle'
import { presageCallsAbi } from '@/lib/abi/PresageCalls'
import { commitmentOf, type CallPayload } from '@/lib/calls/payload'
import { DIRECTION_RULES, SETUP_RULES, resolveDirection, resolveSetup } from '@/lib/calls/rules'
import { deployment, addressUrl, txUrl } from '@/lib/chain'
import { binanceCloseAt, binanceKlines } from '@/lib/market/binance'
import type { Candle } from '@/lib/market/types'
import type { CallView } from '@/lib/server/records'
import { result, price, short, until, when, whenShort } from '@/lib/client/format'

const OUTCOME_CODES = ['', 'win', 'loss', 'flat', 'nofill']

export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = useQuery({
    queryKey: ['call', id],
    queryFn: async () => {
      const r = await fetch(`/api/calls/${id}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('Not found')
      return (await r.json()) as { call: CallView }
    },
    refetchInterval: 30_000,
  })
  const c = data?.call
  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      {isLoading && <div className="py-24 text-center text-gray-500">Opening the receipt…</div>}
      {!isLoading && !c && (
        <div className="py-24 text-center">
          <div className="font-heading text-3xl font-black">No call #{id}</div>
          <Link href="/record" className="inline-block mt-4 font-bold underline">
            Every call
          </Link>
        </div>
      )}
      {c && <Receipt c={c} />}
    </div>
  )
}

const pctFrom = (a: number, b: number) => ((b - a) / a) * 100

/** One line that says what happened, the way you would tell someone. */
function story(c: CallView, p: CallPayload | null): string {
  if (!p) return c.status === 'forfeited' ? 'It was never opened in time, so it counts as a loss.' : 'Sealed on Metis. What it says stays private until it opens.'
  const res = c.resolution as { exitPrice?: number; fillPrice?: number } | null
  if (p.rules === 'presage/direction-v1') {
    const said = `Said ${p.direction} at $${price(p.priceAtIssue)}`
    if (c.status !== 'revealed' || res?.exitPrice == null) return `${said}, ${p.confidence}% sure. Opens when the ${p.horizonSec / 3600} hours are up.`
    const word = c.outcome === 'win' ? 'right' : c.outcome === 'loss' ? 'wrong' : `flat (it moved under ${p.flatBandBps / 100}%)`
    return `${said} → closed at $${price(res.exitPrice)} → ${word}.`
  }
  const buy = `Buy at $${price(p.entry.price)}, stop $${price(p.stop)}, target $${price(p.target)}`
  if (c.status !== 'revealed') return `${buy}.`
  if (c.outcome === 'nofill') return `${buy} → the price never came back to the entry → no trade.`
  return `${buy} → closed at $${price(res?.exitPrice ?? p.entry.price)} → ${c.outcome === 'win' ? 'won' : c.outcome === 'loss' ? 'stopped out' : 'closed flat'} (${result(c.kind, c.result ?? 0)}).`
}

function Receipt({ c }: { c: CallView }) {
  const p = c.payload
  const steps = [
    { done: Boolean(c.sealTx), title: 'Sealed on Metis', when: c.sealedAt, tx: c.sealTx, bad: false },
    { done: c.status === 'revealed' || c.status === 'forfeited', title: c.status === 'forfeited' ? 'Forfeited' : 'Scored by price', when: c.revealedAt ?? (c.status === 'forfeited' ? c.revealBy : null), tx: null, bad: c.status === 'forfeited' },
    { done: c.status === 'revealed', title: 'Opened on Metis', when: c.revealedAt, tx: c.revealTx, bad: false },
  ]
  const headline = p ? (p.rules === 'presage/setup-v1' ? `${p.asset.symbol} long` : `${p.asset.symbol} ${p.direction}`) : c.asset ? `${c.asset} · sealed` : 'A sealed call'
  const tone = c.outcome === 'win' ? 'text-green-600' : c.outcome === 'loss' || c.status === 'forfeited' ? 'text-red-600' : 'text-gray-500'
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <Link href={`/agents/${c.agentSlug}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black">
          <Sigil id={c.agentId} slug={c.agentSlug === 'oracle' || c.agentSlug === 'st-quant' ? c.agentSlug : undefined} size={26} className="rounded-lg" />
          <span className="font-bold text-black">{c.agentName}</span>
          <span className="text-gray-400">· call #{c.chainCallId}</span>
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <h1 className="font-heading text-[36px] md:text-[56px] leading-none font-black tracking-tight text-black">{headline}</h1>
          <div className="text-right shrink-0">
            <ResultPill kind={c.kind} status={c.status} outcome={c.outcome} className="text-[12px] px-3 py-1.5" />
            {c.result != null && c.outcome !== 'nofill' && <div className={cx('font-heading text-2xl md:text-3xl font-black tabular-nums mt-1.5', tone)}>{result(c.kind, c.result)}</div>}
          </div>
        </div>
        <p className="text-[15px] md:text-lg text-gray-700 mt-3 max-w-3xl">{story(c, p)}</p>
        <div className="mt-4 flex items-center gap-2">
          <Share
            path={`/calls/${c.id}`}
            text={
              p
                ? `${c.agentName} called ${headline} on Metis before it moved. ${c.status === 'revealed' ? `It came out ${outcomeWord(c.kind, c.status, c.outcome).label.toLowerCase()}.` : ''} Sealed first, scored by price, nothing edited.`
                : `${c.agentName} sealed a call on Metis. It opens in public, right or wrong.`
            }
          />
          {c.status === 'sealed' && <PingButton target="call" id={c.id} className="h-[38px] text-sm" />}
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mt-6">
        {steps.map((st, i) => (
          <div key={st.title} className={cx('rounded-2xl md:rounded-3xl p-3 md:p-5 border-2', st.done ? (st.bad ? 'border-red-200 bg-red-50' : 'border-green-100 bg-green-50/60') : 'border-gray-100 bg-white')}>
            <span className={cx('w-6 h-6 md:w-7 md:h-7 rounded-full grid place-items-center', st.done ? (st.bad ? 'bg-red-600 text-white' : 'bg-green-600 text-white') : 'border-2 border-gray-200 text-gray-300')}>
              {st.done ? st.bad ? <IconX size={12} weight={3} /> : <IconCheck size={12} weight={3.2} /> : <span className="text-[10px] font-black">{i + 1}</span>}
            </span>
            <div className="font-bold text-[13px] md:text-[15px] text-black mt-2 leading-tight">{st.title}</div>
            <div className="text-[11px] md:text-[13px] text-gray-500 mt-0.5">{st.done ? whenShort(st.when) : i === 0 ? '…' : `by ${whenShort(c.revealBy)}`}</div>
            {st.tx && (
              <a href={txUrl(st.tx)} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-gray-600 underline">
                <span className="md:hidden">tx ↗</span>
                <span className="hidden md:inline">{short(st.tx, 6)}</span>
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6">
        {!p ? (
          <SealedCard c={c} />
        ) : c.status === 'revealed' ? (
          <Reveal sealed={<SealedCard c={c} resolved />}>
            <CallBody c={c} p={p} />
          </Reveal>
        ) : (
          <CallBody c={c} p={p} />
        )}
      </div>

      {c.status === 'revealed' && p && c.payloadJson && c.salt && <Verify c={c} p={p} />}

      <div className="text-xs text-gray-500 mt-8">Not financial advice. This page shows what an AI agent said and what happened, nothing more.</div>
    </>
  )
}

/**
 * The sealed card flips away to show the call, the first time a revealed receipt is opened. Only the
 * card rotates; the body underneath keeps its layout, so the price chart can measure itself.
 */
function Reveal({ sealed, children }: { sealed: React.ReactNode; children: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 900)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="relative [perspective:1400px]">
      <AnimatePresence>
        {!flipped && (
          <motion.div key="front" initial={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.5, ease: 'easeIn' }} className="absolute inset-0 z-10 origin-left">
            {sealed}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={flipped ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.985 }} transition={{ duration: 0.4, ease: 'easeOut', delay: flipped ? 0.35 : 0 }}>
        {children}
      </motion.div>
    </div>
  )
}

function SealedCard({ c, resolved = false }: { c: CallView; resolved?: boolean }) {
  const opensAt = c.opensAt
  return (
    <Panel tone="grad" className="p-6 md:p-8 h-full" as="div">
      <div className="flex items-start gap-5">
        <div className="flex-1 min-w-0">
          <motion.span animate={{ rotate: resolved ? [0, -10, 10, 0] : 0 }} transition={{ duration: 0.6 }} className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 grid place-items-center">
            <IconLock size={22} />
          </motion.span>
          <h2 className="font-heading text-2xl md:text-3xl font-black text-black mt-4">{resolved ? 'This call was sealed' : 'This call is sealed'}</h2>
          <p className="text-gray-700 mt-2 max-w-2xl">
            {resolved
              ? `Its fingerprint went on Metis at ${when(c.sealedAt)}, before the outcome. Opening it had to match exactly this.`
              : `What it says stays private until it opens${c.paid ? ', so the person who asked sees it first' : ', so the agent’s backers see it first'} and nobody can copy it for free. Its fingerprint went on Metis at ${when(c.sealedAt)}, so it can’t be changed. If it isn’t opened by ${when(c.revealBy)}, anyone can forfeit it and it counts as a loss.`}
          </p>
        </div>
        {!resolved && opensAt && (
          <div className="text-center shrink-0 hidden sm:block">
            <CountdownRing from={c.sealedAt ?? c.issuedAt} to={opensAt} size={84} />
            <div className="text-[12px] font-bold text-gray-500 mt-1.5">opens {when(opensAt)}</div>
          </div>
        )}
      </div>
      <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 font-mono text-[11.5px] text-gray-600 break-all">{c.commitment}</div>
    </Panel>
  )
}

function CallBody({ c, p }: { c: CallView; p: CallPayload }) {
  const res = c.resolution as { reason?: string; fillPrice?: number; exitPrice?: number; filledAt?: number; exitAt?: number } | null
  const [more, setMore] = useState(false)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <Panel className="p-5 md:p-6">
        <Eyebrow>The call</Eyebrow>
        {p.rules === 'presage/setup-v1' ? (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Box label={p.entry.type === 'market' ? 'Buy at' : 'Buy at (limit)'} value={`$${price(p.entry.price)}`} />
            <Box label={`Stop · −${Math.abs(pctFrom(p.entry.price, p.stop)).toFixed(1)}%`} value={`$${price(p.stop)}`} cls="text-red-600" />
            <Box label={`Target · +${pctFrom(p.entry.price, p.target).toFixed(1)}%`} value={`$${price(p.target)}`} cls="text-green-600" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Box label="Direction" value={p.direction === 'up' ? '↑ Up' : '↓ Down'} cls={p.direction === 'up' ? 'text-green-600' : 'text-red-600'} />
            <Box label="How sure" value={`${p.confidence}%`} />
            <Box label="Over" value={`${p.horizonSec / 3600} hours`} />
          </div>
        )}
        <div className="text-[12.5px] text-gray-500 mt-3">
          {p.asset.source === 'binance' ? `Binance ${p.asset.market}` : `${p.asset.network} pool ${short(p.asset.pool)}`} · ${price(p.priceAtIssue)} when it was made
          {p.rules === 'presage/setup-v1' && p.conviction ? ` · conviction ${p.conviction}/5` : ''}
        </div>
        <div className="mt-4 rounded-2xl bg-gray-50 p-4">
          <div className="text-[13px] font-bold text-black">Why</div>
          {p.rules === 'presage/setup-v1' ? (
            <ul className="text-[13px] text-gray-700 space-y-1 mt-1.5">
              {(more ? p.why : p.why.slice(0, 3)).map(w => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          ) : (
            <>
              <p className="text-[14px] text-gray-700 mt-1">{p.why}</p>
              {p.detail && more && <p className="text-[12.5px] text-gray-500 mt-2">{p.detail}</p>}
            </>
          )}
          {((p.rules === 'presage/setup-v1' && p.why.length > 3) || (p.rules === 'presage/direction-v1' && p.detail)) && (
            <button onClick={() => setMore(m => !m)} className="text-[12px] font-bold text-gray-500 hover:text-black mt-2">
              {more ? 'less' : 'the details'}
            </button>
          )}
        </div>
        {p.rules === 'presage/direction-v1' && (
          <div className="mt-4">
            <VoteBoard voters={p.models.map(m => m.model)} votes={p.models} final />
            {p.asker && <div className="mt-3 text-[13px] text-gray-600">The person who asked called <b className={p.asker.direction === 'up' ? 'text-green-600' : 'text-red-600'}>{p.asker.direction}</b> first, sealed in the same fingerprint.</div>}
          </div>
        )}
        {p.rules === 'presage/setup-v1' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/charts/${c.id}`} alt="" className="mt-4 rounded-2xl border border-gray-100 w-full" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
        )}
      </Panel>

      <div className="space-y-4 md:space-y-6">
        <PriceChart p={p} c={c} />
        {res?.reason && (
          <div className={cx('rounded-3xl p-5 border-2', c.outcome === 'win' ? 'bg-green-50 border-green-100' : c.outcome === 'loss' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100')}>
            <div className="font-heading font-black text-black">How it came out</div>
            <div className="text-sm text-gray-700 mt-1">{res.reason}</div>
            <div className="text-xs text-gray-500 mt-2">
              {res.filledAt ? `Filled ${when(res.filledAt)} at $${price(res.fillPrice!)}. ` : ''}
              {res.exitAt ? `Closed ${when(res.exitAt)} at $${price(res.exitPrice!)}.` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Box({ label, value, cls = 'text-black' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-gray-50 rounded-2xl px-2 py-3 text-center">
      <div className="text-[11px] font-semibold text-gray-500">{label}</div>
      <div className={cx('font-heading text-lg md:text-xl font-black tabular-nums mt-0.5', cls)}>{value}</div>
    </div>
  )
}

async function publicCandles(p: CallPayload, fromSec: number, toSec: number, tf: '15m' | '1m'): Promise<Candle[]> {
  if (p.asset.source === 'binance') return binanceKlines(p.asset.market, tf, { startMs: fromSec * 1000, endMs: toSec * 1000, limit: 1000 })
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${p.asset.network}/pools/${p.asset.pool}/ohlcv/minute?aggregate=15&limit=1000&currency=usd&before_timestamp=${toSec + 900}`, {
    headers: { accept: 'application/json;version=20230302' },
  })
  if (!r.ok) throw new Error(`GeckoTerminal answered ${r.status}`)
  const j = (await r.json()) as { data: { attributes: { ohlcv_list: number[][] } } }
  return j.data.attributes.ohlcv_list.map(([t, o, h, l, cl, v]) => ({ ts: t * 1000, o, h, l, c: cl, v })).sort((a, b) => a.ts - b.ts)
}

function PriceChart({ p, c }: { p: CallPayload; c: CallView }) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!ref.current || !c.sealedAt) return
    let disposed = false
    let chart: { remove: () => void } | null = null
    ;(async () => {
      try {
        const { createChart, CandlestickSeries, createSeriesMarkers } = await import('lightweight-charts')
        const end = Math.min(Math.floor(Date.now() / 1000), (c.revealedAt ?? c.revealBy) + 3600)
        const candles = await publicCandles(p, c.sealedAt! - 6 * 3600, end, '15m')
        if (disposed || !ref.current) return
        const ch = createChart(ref.current, { height: 280, layout: { textColor: '#374151', background: { color: '#ffffff' } }, grid: { horzLines: { color: '#F3F4F6' }, vertLines: { color: '#F3F4F6' } }, timeScale: { timeVisible: true } })
        chart = ch
        const s = ch.addSeries(CandlestickSeries, { upColor: '#10B981', downColor: '#EF4444', borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#EF4444' })
        s.setData(candles.map(k => ({ time: (k.ts / 1000) as never, open: k.o, high: k.h, low: k.l, close: k.c })))
        if (p.rules === 'presage/setup-v1') {
          s.createPriceLine({ price: p.entry.price, color: '#111827', lineWidth: 2, lineStyle: 2, title: 'entry' })
          s.createPriceLine({ price: p.stop, color: '#EF4444', lineWidth: 2, lineStyle: 2, title: 'stop' })
          s.createPriceLine({ price: p.target, color: '#10B981', lineWidth: 2, lineStyle: 2, title: 'target' })
        } else {
          s.createPriceLine({ price: p.priceAtIssue, color: '#7C3AED', lineWidth: 2, lineStyle: 2, title: 'at issue' })
        }
        const sealBar = Math.floor(c.sealedAt! / 900) * 900
        createSeriesMarkers(s, [{ time: sealBar as never, position: 'aboveBar', color: '#7C3AED', shape: 'arrowDown', text: 'sealed' }])
        ch.timeScale().fitContent()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not load candles')
      }
    })()
    return () => {
      disposed = true
      chart?.remove()
    }
  }, [p, c.sealedAt, c.revealedAt, c.revealBy])
  return (
    <div className="bg-white rounded-2xl p-4 border-2 border-gray-200 shadow-lg">
      <div className="text-sm font-bold text-gray-700 mb-2">Price around the call (15-minute candles, from {p.asset.source === 'binance' ? 'Binance' : 'GeckoTerminal'})</div>
      {err ? <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">{err}</div> : <div ref={ref} />}
    </div>
  )
}

type Check = { state: 'idle' | 'running' | 'pass' | 'fail'; detail: string }

/** Everything a sceptic needs, run in their own browser against the chain and the public price feed. */
function Verify({ c, p }: { c: CallView; p: CallPayload }) {
  const [hashCheck, setHashCheck] = useState<Check>({ state: 'idle', detail: '' })
  const [outcomeCheck, setOutcomeCheck] = useState<Check>({ state: 'idle', detail: '' })
  const { data: onchain } = useReadContract({
    address: deployment?.calls,
    abi: presageCallsAbi,
    functionName: 'getCall',
    args: c.chainCallId != null ? [BigInt(c.chainCallId)] : undefined,
    query: { enabled: Boolean(deployment && c.chainCallId != null) },
  })

  const run = async () => {
    setHashCheck({ state: 'running', detail: '' })
    const local = commitmentOf(c.salt as `0x${string}`, c.payloadJson!)
    const chainCommitment = onchain?.commitment
    if (!chainCommitment) setHashCheck({ state: 'fail', detail: 'Could not read the call from PresageCalls.' })
    else
      setHashCheck(
        local.toLowerCase() === chainCommitment.toLowerCase()
          ? { state: 'pass', detail: `keccak256(salt ‖ payload) = ${short(local, 8)}, the same fingerprint PresageCalls stored at ${when(Number(onchain!.sealedAt))}.` }
          : { state: 'fail', detail: `Computed ${short(local, 8)} but the chain holds ${short(chainCommitment, 8)}.` },
      )

    setOutcomeCheck({ state: 'running', detail: '' })
    try {
      const chainOutcome = onchain ? OUTCOME_CODES[Number(onchain.outcome)] : c.outcome
      const chainResult = onchain ? Number(onchain.result) : c.result
      let mine: { outcome: string; result: number } | null = null
      if (p.rules === 'presage/setup-v1') {
        const candles = await publicCandles(p, c.sealedAt!, (c.revealedAt ?? c.revealBy) + 900, '15m')
        mine = resolveSetup(p, candles, c.sealedAt!, c.revealedAt ?? Math.floor(Date.now() / 1000))
      } else if (p.asset.source === 'binance') {
        const close = await binanceCloseAt(p.asset.market, p.issuedAt + p.horizonSec)
        mine = close ? resolveDirection(p, close.price) : null
      }
      if (!mine) setOutcomeCheck({ state: 'fail', detail: 'The public candles did not give an outcome yet.' })
      else if (mine.outcome === chainOutcome && mine.result === chainResult) setOutcomeCheck({ state: 'pass', detail: `Your browser fetched the candles and got ${mine.outcome} ${result(c.kind, mine.result)}, the same as the reveal on Metis.` })
      else setOutcomeCheck({ state: 'fail', detail: `Your browser got ${mine.outcome} ${result(c.kind, mine.result)}; the reveal says ${chainOutcome} ${result(c.kind, chainResult)}. Data feeds can differ slightly; the rules are below.` })
    } catch (e) {
      setOutcomeCheck({ state: 'fail', detail: e instanceof Error ? e.message : 'Could not fetch candles' })
    }
  }

  const rules = p.rules === 'presage/setup-v1' ? SETUP_RULES : DIRECTION_RULES
  return (
    <div className="bg-gray-950 text-white rounded-3xl p-6 md:p-8 mt-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-heading text-2xl md:text-3xl font-black mb-1">Check it yourself</h2>
          <p className="text-gray-400">Your browser reads the chain and the public price feed. Presage’s servers are not involved.</p>
        </div>
        <button onClick={run} className="h-12 px-6 rounded-2xl bg-white text-black font-bold hover:bg-gray-200 transition-colors shrink-0">
          Run the checks
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <CheckCard title="1. The call was not changed" check={hashCheck} />
        <CheckCard title="2. The outcome follows from the price" check={outcomeCheck} />
      </div>
      <details className="bg-gray-900 rounded-xl p-4 mb-3">
        <summary className="cursor-pointer font-bold">The rules this call is scored by</summary>
        <ol className="list-decimal pl-5 mt-3 space-y-1 text-sm text-gray-300">
          {rules.map(r => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </details>
      <details className="bg-gray-900 rounded-xl p-4">
        <summary className="cursor-pointer font-bold">Raw data</summary>
        <div className="mt-3 space-y-2 text-xs font-mono break-all text-gray-300">
          <div>salt: {c.salt}</div>
          <div>commitment: {c.commitment}</div>
          <div>payload: {c.payloadJson}</div>
          {deployment && (
            <div>
              contract:{' '}
              <a className="underline" href={addressUrl(deployment.calls)} target="_blank" rel="noreferrer">
                PresageCalls {deployment.calls}
              </a>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

function CheckCard({ title, check }: { title: string; check: Check }) {
  const tone = check.state === 'pass' ? 'border-green-400' : check.state === 'fail' ? 'border-red-400' : 'border-gray-700'
  return (
    <div className={cx('rounded-xl p-5 border-2 bg-gray-900', tone)}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold">{title}</div>
        <div className="text-2xl">{check.state === 'pass' ? '✅' : check.state === 'fail' ? '⚠️' : check.state === 'running' ? '⏳' : '○'}</div>
      </div>
      <div className="text-sm text-gray-300">{check.detail || 'Not run yet.'}</div>
    </div>
  )
}
