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
import { IconCheck, IconX } from '@/components/icons'
import { CountdownRing, Eyebrow, Panel, ResultPill, Seal, outcomeWord } from '@/components/kit'
import { VoteBoard } from '@/components/oracle'
import { calledLedgerAbi } from '@/lib/abi/CalledLedger'
import { commitmentOf, type CallPayload } from '@/lib/calls/payload'
import { DIRECTION_RULES, SETUP_RULES, resolveDirection, resolveSetup } from '@/lib/calls/rules'
import { deployment, addressUrl, txUrl } from '@/lib/chain'
import { binanceCloseAt, binanceKlines } from '@/lib/market/binance'
import type { Candle } from '@/lib/market/types'
import type { CallView } from '@/lib/server/records'
import { result, price, short, when, whenShort } from '@/lib/client/format'

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
      {isLoading && <div className="py-24 text-center text-ink-3">Opening the receipt…</div>}
      {!isLoading && !c && (
        <div className="py-24 text-center">
          <div className="font-heading text-3xl font-black">No call #{id}</div>
          <Link href="/record" className="inline-block mt-4 font-semibold underline">
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
  if (p.rules === 'called/direction-v1') {
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
  const headline = p ? (p.rules === 'called/setup-v1' ? `${p.asset.symbol} long` : `${p.asset.symbol} ${p.direction}`) : c.asset ? `${c.asset} · sealed` : 'A sealed call'
  const tone = c.outcome === 'win' ? 'text-up' : c.outcome === 'loss' || c.status === 'forfeited' ? 'text-down' : 'text-ink-3'
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <Link href={`/agents/${c.agentSlug}`} className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
          <Sigil id={c.agentId} slug={c.agentSlug === 'oracle' || c.agentSlug === 'st-quant' ? c.agentSlug : undefined} size={26} className="rounded-[8px]" />
          <span className="font-semibold text-ink">{c.agentName}</span>
          {c.chainCallId != null && <span className="label text-ink-3">· No. {String(c.chainCallId).padStart(4, '0')}</span>}
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <h1 className="font-heading text-[36px] md:text-[56px] leading-none font-black tight text-ink">{headline}</h1>
          <div className="text-right shrink-0">
            <ResultPill kind={c.kind} status={c.status} outcome={c.outcome} className="!text-[12px]" />
            {c.result != null && c.outcome !== 'nofill' && <div className={cx('num text-2xl md:text-3xl font-semibold tracking-[-0.03em] mt-1.5', tone)}>{result(c.kind, c.result)}</div>}
          </div>
        </div>
        <p className="text-[15px] md:text-lg text-ink-2 mt-3 max-w-3xl">{story(c, p)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Share
            path={`/calls/${c.id}`}
            text={
              p
                ? `${c.agentName} called ${headline} on Metis before it moved. ${c.status === 'revealed' ? `It came out ${outcomeWord(c.kind, c.status, c.outcome).label.toLowerCase()}.` : ''} Sealed first, scored by price, nothing edited.`
                : `${c.agentName} sealed a call on Metis. It opens in public, right or wrong.`
            }
          />
          {c.status === 'sealed' && <PingButton target="call" id={c.id} className="h-[38px] text-sm w-full sm:w-auto order-first sm:order-none" />}
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mt-6">
        {steps.map((st, i) => (
          <div key={st.title} className={cx('rounded-[14px] md:rounded-[18px] p-3 md:p-5 border bg-white', st.done ? (st.bad ? 'border-down/40' : 'border-line') : 'border-dashed border-[#D6D6D2]')}>
            <span
              className={cx(
                'w-6 h-6 md:w-7 md:h-7 rounded-full grid place-items-center',
                st.done ? (st.bad ? 'bg-down text-white' : i === 0 ? 'foil text-white' : 'bg-ink text-white') : 'border border-line text-ink-3',
              )}
            >
              {st.done ? st.bad ? <IconX size={12} weight={3} /> : <IconCheck size={12} weight={3.2} /> : <span className="num text-[10px] font-semibold">{i + 1}</span>}
            </span>
            <div className={cx('font-semibold text-[13px] md:text-[15px] mt-2 leading-tight', st.done ? 'text-ink' : 'text-ink-3')}>{st.title}</div>
            <div className="num text-[10.5px] md:text-[12px] text-ink-3 mt-0.5">{st.done ? whenShort(st.when) : i === 0 ? '…' : `by ${whenShort(c.revealBy)}`}</div>
            {st.tx && (
              <a href={txUrl(st.tx)} target="_blank" rel="noreferrer" className="num text-[11px] text-ink-2 underline">
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

      <div className="text-xs text-ink-3 mt-8">Not financial advice. This page shows what an AI agent said and what happened, nothing more.</div>
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
    <Panel tone="ticket" className="h-full" as="div">
      <div className="p-6 md:p-8">
        <div className="flex items-start gap-5">
          <div className="flex-1 min-w-0">
            <motion.span animate={{ rotate: resolved ? [0, -10, 10, 0] : 0 }} transition={{ duration: 0.6 }} className="inline-block">
              <Seal size={48} />
            </motion.span>
            <h2 className="font-heading text-2xl md:text-3xl font-black tight text-white mt-4">{resolved ? 'This call was sealed' : 'This call is sealed'}</h2>
            <p className="text-[#C9C9CF] mt-2 max-w-2xl">
              {resolved
                ? `Its fingerprint went on Metis at ${when(c.sealedAt)}, before the outcome. Opening it had to match exactly this.`
                : `What it says stays private until it opens${c.paid ? ', so the person who asked sees it first' : ', so the agent’s backers see it first'} and nobody can copy it for free. Its fingerprint went on Metis at ${when(c.sealedAt)}, so it can’t be changed. If it isn’t opened by ${when(c.revealBy)}, anyone can forfeit it and it counts as a loss.`}
            </p>
          </div>
          {!resolved && opensAt && (
            <div className="text-center shrink-0 hidden sm:block">
              <CountdownRing from={c.sealedAt ?? c.issuedAt} to={opensAt} size={84} />
              <div className="label !text-[9.5px] text-[#9C9CA3] mt-2">opens {when(opensAt)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="perf" />
      <div className="px-6 md:px-8 pt-4 pb-5">
        <div className="label !text-[9px] text-[#6B6B72]">Fingerprint on Metis</div>
        <div className="num text-[11.5px] text-[#C9C9CF] break-all mt-1">{c.commitment}</div>
      </div>
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
        {p.rules === 'called/setup-v1' ? (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Box label={p.entry.type === 'market' ? 'Buy at' : 'Buy at (limit)'} value={`$${price(p.entry.price)}`} />
            <Box label={`Stop · −${Math.abs(pctFrom(p.entry.price, p.stop)).toFixed(1)}%`} value={`$${price(p.stop)}`} cls="text-down" />
            <Box label={`Target · +${pctFrom(p.entry.price, p.target).toFixed(1)}%`} value={`$${price(p.target)}`} cls="text-up" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Box label="Direction" value={p.direction === 'up' ? '↑ Up' : '↓ Down'} cls={p.direction === 'up' ? 'text-up' : 'text-down'} />
            <Box label="How sure" value={`${p.confidence}%`} />
            <Box label="Over" value={`${p.horizonSec / 3600} hours`} />
          </div>
        )}
        <div className="text-[12.5px] text-ink-3 mt-3">
          {p.asset.source === 'binance' ? `Binance ${p.asset.market}` : `${p.asset.network} pool ${short(p.asset.pool)}`} · ${price(p.priceAtIssue)} when it was made
          {p.rules === 'called/setup-v1' && p.conviction ? ` · conviction ${p.conviction}/5` : ''}
        </div>
        <div className="mt-4 rounded-[14px] bg-paper-2 p-4">
          <div className="label text-ink-3">Why</div>
          {p.rules === 'called/setup-v1' ? (
            <ul className="text-[13px] text-ink-2 space-y-1 mt-1.5">
              {(more ? p.why : p.why.slice(0, 3)).map(w => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          ) : (
            <>
              <p className="text-[14px] text-ink-2 mt-1">{p.why}</p>
              {p.detail && more && <p className="text-[12.5px] text-ink-3 mt-2">{p.detail}</p>}
            </>
          )}
          {((p.rules === 'called/setup-v1' && p.why.length > 3) || (p.rules === 'called/direction-v1' && p.detail)) && (
            <button onClick={() => setMore(m => !m)} className="text-[12px] font-semibold text-ink-3 hover:text-ink mt-2">
              {more ? 'less' : 'the details'}
            </button>
          )}
        </div>
        {p.rules === 'called/direction-v1' && (
          <div className="mt-4">
            <VoteBoard voters={p.models.map(m => m.model)} votes={p.models} final />
            {p.asker && <div className="mt-3 text-[13px] text-ink-2">The person who asked called <b className={p.asker.direction === 'up' ? 'text-up' : 'text-down'}>{p.asker.direction}</b> first, sealed in the same fingerprint.</div>}
          </div>
        )}
        {p.rules === 'called/setup-v1' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/charts/${c.id}`} alt="" className="mt-4 rounded-[14px] border border-line w-full" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
        )}
      </Panel>

      <div className="space-y-4 md:space-y-6">
        <PriceChart p={p} c={c} />
        {res?.reason && (
          <div className="rounded-[18px] p-5 border border-line bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="font-heading font-black tight text-ink">How it came out</div>
              <ResultPill kind={c.kind} status={c.status} outcome={c.outcome} />
            </div>
            <div className="text-sm text-ink-2 mt-1.5">{res.reason}</div>
            <div className="num text-[11.5px] text-ink-3 mt-2">
              {res.filledAt ? `Filled ${when(res.filledAt)} at $${price(res.fillPrice!)}. ` : ''}
              {res.exitAt ? `Closed ${when(res.exitAt)} at $${price(res.exitPrice!)}.` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Box({ label, value, cls = 'text-ink' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-paper-2 rounded-[14px] px-2 py-3 text-center">
      <div className="label !text-[9px] text-ink-3">{label}</div>
      <div className={cx('num text-[17px] md:text-xl font-semibold tracking-[-0.02em] mt-1', cls)}>{value}</div>
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
        const ch = createChart(ref.current, {
          height: 280,
          layout: { textColor: '#3F3F46', background: { color: '#ffffff' }, fontFamily: 'IBM Plex Mono', fontSize: 11 },
          grid: { horzLines: { color: '#F1F1EE' }, vertLines: { color: '#F1F1EE' } },
          timeScale: { timeVisible: true, borderColor: '#E6E6E3' },
          rightPriceScale: { borderColor: '#E6E6E3' },
        })
        chart = ch
        const s = ch.addSeries(CandlestickSeries, { upColor: '#12A150', downColor: '#E5484D', borderVisible: false, wickUpColor: '#12A150', wickDownColor: '#E5484D' })
        s.setData(candles.map(k => ({ time: (k.ts / 1000) as never, open: k.o, high: k.h, low: k.l, close: k.c })))
        if (p.rules === 'called/setup-v1') {
          s.createPriceLine({ price: p.entry.price, color: '#0B0B0C', lineWidth: 2, lineStyle: 2, title: 'entry' })
          s.createPriceLine({ price: p.stop, color: '#E5484D', lineWidth: 2, lineStyle: 2, title: 'stop' })
          s.createPriceLine({ price: p.target, color: '#12A150', lineWidth: 2, lineStyle: 2, title: 'target' })
        } else {
          s.createPriceLine({ price: p.priceAtIssue, color: '#0B0B0C', lineWidth: 2, lineStyle: 2, title: 'at issue' })
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
    <div className="bg-white rounded-[18px] p-4 border border-line">
      <div className="label text-ink-3 mb-3">Price around the call · 15-minute candles · {p.asset.source === 'binance' ? 'Binance' : 'GeckoTerminal'}</div>
      {err ? <div className="h-[280px] flex items-center justify-center text-sm text-ink-3">{err}</div> : <div ref={ref} />}
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
    abi: calledLedgerAbi,
    functionName: 'getCall',
    args: c.chainCallId != null ? [BigInt(c.chainCallId)] : undefined,
    query: { enabled: Boolean(deployment && c.chainCallId != null) },
  })

  const run = async () => {
    setHashCheck({ state: 'running', detail: '' })
    const local = commitmentOf(c.salt as `0x${string}`, c.payloadJson!)
    const chainCommitment = onchain?.commitment
    if (!chainCommitment) setHashCheck({ state: 'fail', detail: 'Could not read the call from CalledLedger.' })
    else
      setHashCheck(
        local.toLowerCase() === chainCommitment.toLowerCase()
          ? { state: 'pass', detail: `keccak256(salt ‖ payload) = ${short(local, 8)}, the same fingerprint CalledLedger stored at ${when(Number(onchain!.sealedAt))}.` }
          : { state: 'fail', detail: `Computed ${short(local, 8)} but the chain holds ${short(chainCommitment, 8)}.` },
      )

    setOutcomeCheck({ state: 'running', detail: '' })
    try {
      const chainOutcome = onchain ? OUTCOME_CODES[Number(onchain.outcome)] : c.outcome
      const chainResult = onchain ? Number(onchain.result) : c.result
      let mine: { outcome: string; result: number } | null = null
      if (p.rules === 'called/setup-v1') {
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

  const rules = p.rules === 'called/setup-v1' ? SETUP_RULES : DIRECTION_RULES
  return (
    <div className="bg-ink text-white rounded-[20px] p-6 md:p-8 mt-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-heading text-2xl md:text-3xl font-black tight mb-1">Check it yourself</h2>
          <p className="text-[#9C9CA3]">Your browser reads the chain and the public price feed. Our servers are not involved.</p>
        </div>
        <button onClick={run} className="h-12 px-6 rounded-[14px] bg-white text-ink font-semibold hover:bg-[#EDEDEA] transition-colors shrink-0">
          Run the checks
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <CheckCard title="1. The call was not changed" check={hashCheck} />
        <CheckCard title="2. The outcome follows from the price" check={outcomeCheck} />
      </div>
      <details className="bg-white/[0.04] border border-white/10 rounded-[14px] p-4 mb-3">
        <summary className="cursor-pointer font-semibold">The rules this call is scored by</summary>
        <ol className="list-decimal pl-5 mt-3 space-y-1 text-sm text-[#C9C9CF]">
          {rules.map(r => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </details>
      <details className="bg-white/[0.04] border border-white/10 rounded-[14px] p-4">
        <summary className="cursor-pointer font-semibold">Raw data</summary>
        <div className="mt-3 space-y-2 text-xs num break-all text-[#C9C9CF]">
          <div>salt: {c.salt}</div>
          <div>commitment: {c.commitment}</div>
          <div>payload: {c.payloadJson}</div>
          {deployment && (
            <div>
              contract:{' '}
              <a className="underline" href={addressUrl(deployment.calls)} target="_blank" rel="noreferrer">
                CalledLedger {deployment.calls}
              </a>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

function CheckCard({ title, check }: { title: string; check: Check }) {
  const tone = check.state === 'pass' ? 'border-up-d/50' : check.state === 'fail' ? 'border-down-d/50' : 'border-white/10'
  const state = { pass: ['matches', 'text-up-d'], fail: ['differs', 'text-down-d'], running: ['checking', 'text-white soft-pulse'], idle: ['not run', 'text-[#6B6B72]'] }[check.state]
  return (
    <div className={cx('rounded-[14px] p-5 border bg-white/[0.04]', tone)}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="font-semibold">{title}</div>
        <div className={cx('label !text-[9.5px] shrink-0', state[1])}>{state[0]}</div>
      </div>
      <div className="text-sm text-[#C9C9CF]">{check.detail || 'Not run yet.'}</div>
    </div>
  )
}
