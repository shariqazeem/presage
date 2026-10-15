'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { OutcomeBadge } from '@/components/agents'
import { Sigil } from '@/components/Sigil'
import { Share } from '@/components/Share'
import { Button, Container, cx } from '@/components/ui'
import { presageCallsAbi } from '@/lib/abi/PresageCalls'
import { commitmentOf, type CallPayload } from '@/lib/calls/payload'
import { DIRECTION_RULES, SETUP_RULES, resolveDirection, resolveSetup } from '@/lib/calls/rules'
import { deployment, addressUrl, txUrl } from '@/lib/chain'
import { binanceCloseAt, binanceKlines } from '@/lib/market/binance'
import type { Candle } from '@/lib/market/types'
import type { CallView } from '@/lib/server/records'
import { result, price, short, until, when } from '@/lib/client/format'

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
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="record" />
      <Container className="py-8 max-w-6xl">
        {isLoading && <div className="py-24 text-center text-gray-500">Loading the receipt…</div>}
        {!isLoading && !c && (
          <div className="py-24 text-center">
            <div className="text-6xl mb-4">🧾</div>
            <div className="text-2xl font-black">No call #{id}</div>
          </div>
        )}
        {c && <Receipt c={c} />}
      </Container>
    </div>
  )
}

function Receipt({ c }: { c: CallView }) {
  const p = c.payload
  const steps = [
    { done: Boolean(c.sealTx), icon: '🔒', title: 'Sealed on Metis', when: c.sealedAt, tx: c.sealTx },
    { done: c.status === 'revealed' || c.status === 'forfeited', icon: c.status === 'forfeited' ? '🚫' : '📏', title: c.status === 'forfeited' ? 'Forfeited' : 'Scored by price', when: c.revealedAt, tx: null },
    { done: c.status === 'revealed', icon: '📖', title: 'Revealed on Metis', when: c.revealedAt, tx: c.revealTx },
  ]
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link href={`/agents/${c.agentSlug}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black mb-3">
          <Sigil id={c.agentId} slug={c.agentSlug === 'oracle' || c.agentSlug === 'st-quant' ? c.agentSlug : undefined} size={24} className="rounded-md" />
          <span className="font-bold">{c.agentName}</span> · call #{c.chainCallId}
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-4xl sm:text-5xl font-black text-black tracking-tight">{p ? (p.rules === 'presage/setup-v1' ? `${p.asset.symbol} long` : `${p.asset.symbol} ${p.direction}`) : 'A sealed call'}</h1>
          <div className="flex items-center gap-3">
            {c.result != null && <span className={cx('text-3xl font-black tabular-nums', c.result > 0 ? 'text-green-600' : c.result < 0 ? 'text-red-600' : 'text-black')}>{result(c.kind, c.result)}</span>}
            <OutcomeBadge c={c} />
          </div>
        </div>
        <Share
          className="mt-4"
          path={`/calls/${c.id}`}
          text={
            p
              ? `${c.agentName} called ${p.rules === 'presage/setup-v1' ? `${p.asset.symbol} long` : `${p.asset.symbol} ${p.direction}`} on Metis before it moved. ${c.status === 'revealed' ? `${(c.outcome ?? '').toUpperCase()} ${c.result != null ? result(c.kind, c.result) : ''}.` : ''} Sealed first, scored by price, nothing edited.`
              : `${c.agentName} sealed a call on Metis. It resolves in public, win or lose.`
          }
        />
      </motion.div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {steps.map((s, i) => (
          <motion.div key={s.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className={cx('rounded-2xl p-5 border-2', s.done ? (s.icon === '🚫' ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300') : 'bg-gray-50 border-gray-200')}>
            <div className="text-3xl mb-2">{s.done ? s.icon : '⏳'}</div>
            <div className="font-black text-black">
              {i + 1}. {s.title}
            </div>
            <div className="text-sm text-gray-600">{s.done ? when(s.when) : i === 0 ? '…' : `due by ${when(c.revealBy)}`}</div>
            {s.tx && (
              <a href={txUrl(s.tx)} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-700 underline">
                {short(s.tx, 8)}
              </a>
            )}
          </motion.div>
        ))}
      </div>

      {!p ? (
        <SealedCard c={c} />
      ) : c.status === 'revealed' ? (
        <Reveal sealed={<SealedCard c={c} resolved />}>
          <CallBody c={c} p={p} />
        </Reveal>
      ) : (
        <CallBody c={c} p={p} />
      )}

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
  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-8 border-2 border-purple-200 mb-8 h-full">
      <motion.div animate={{ rotate: resolved ? [0, -8, 8, 0] : 0 }} transition={{ duration: 0.6 }} className="text-5xl mb-3 inline-block">
        🔒
      </motion.div>
      <h2 className="text-2xl font-black text-black mb-2">{resolved ? 'This call was sealed' : 'This call is sealed'}</h2>
      <p className="text-gray-700 mb-4">
        {resolved
          ? `Its fingerprint was written to Metis at ${when(c.sealedAt)}, before the outcome. The reveal had to hash to exactly this.`
          : `Its contents stay secret until it is scored, so backers get it first and nobody can copy it for free. What everyone can see is its fingerprint, written to Metis at ${when(c.sealedAt)}. When the call is revealed, the reveal has to hash to exactly this, so it cannot be changed. It must be revealed within ${until(c.revealBy)}; after that anyone can forfeit it and it counts as a loss.`}
      </p>
      <div className="bg-white rounded-xl p-4 border border-purple-200 font-mono text-xs break-all">{c.commitment}</div>
    </div>
  )
}

function CallBody({ c, p }: { c: CallView; p: CallPayload }) {
  const res = c.resolution as { reason?: string; fillPrice?: number; exitPrice?: number; filledAt?: number; exitAt?: number } | null
  return (
    <div className="grid md:grid-cols-2 gap-6 mb-8">
      <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-lg">
        <h2 className="text-xl font-black text-black mb-4">The call</h2>
        {p.rules === 'presage/setup-v1' ? (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Box label={p.entry.type === 'market' ? 'Entry (market)' : 'Entry (limit)'} value={price(p.entry.price)} />
            <Box label="Stop" value={price(p.stop)} cls="text-red-600" />
            <Box label="Target" value={price(p.target)} cls="text-green-600" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Box label="Direction" value={p.direction === 'up' ? '📈 Up' : '📉 Down'} />
            <Box label="Confidence" value={`${p.confidence}%`} />
            <Box label="Horizon" value={`${p.horizonSec / 3600}h`} />
          </div>
        )}
        <div className="text-sm text-gray-600 mb-2">
          {p.asset.source === 'binance' ? `Binance ${p.asset.market}` : `${p.asset.network} pool ${short(p.asset.pool)}`} · price at issue {price(p.priceAtIssue)}
          {p.rules === 'presage/setup-v1' && p.conviction ? ` · conviction ${p.conviction}/5` : ''}
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-600 mb-2">Why</div>
          {p.rules === 'presage/setup-v1' ? (
            <ul className="text-sm text-gray-700 space-y-1">
              {p.why.map(w => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-700">{p.why}</p>
          )}
        </div>
        {p.rules === 'presage/direction-v1' && (
          <div className="mt-4 space-y-2">
            {p.models.map(m => (
              <div key={m.model} className="flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm">
                <span className="font-bold">{m.model.split('/').pop()}</span>
                <span className={cx('px-2 py-0.5 rounded-full text-xs font-bold', m.direction === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                  {m.direction.toUpperCase()} {m.confidence}%
                </span>
              </div>
            ))}
          </div>
        )}
        {p.rules === 'presage/setup-v1' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/charts/${c.id}`} alt="" className="mt-4 rounded-xl border border-gray-200 w-full" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
        )}
      </div>

      <div className="space-y-6">
        <PriceChart p={p} c={c} />
        {res?.reason && (
          <div className={cx('rounded-2xl p-5 border-2', c.outcome === 'win' ? 'bg-green-50 border-green-300' : c.outcome === 'loss' ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-300')}>
            <div className="font-black text-black mb-1">How it resolved</div>
            <div className="text-sm text-gray-700">{res.reason}</div>
            <div className="text-xs text-gray-500 mt-2">
              {res.filledAt ? `Filled ${when(res.filledAt)} at ${price(res.fillPrice!)}. ` : ''}
              {res.exitAt ? `Closed ${when(res.exitAt)} at ${price(res.exitPrice!)}.` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Box({ label, value, cls = 'text-black' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={cx('text-lg font-black', cls)}>{value}</div>
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
    <div className="bg-black text-white rounded-2xl p-8 shadow-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-black mb-1">Check it yourself</h2>
          <p className="text-gray-400">Your browser reads the chain and the public price feed. Presage’s servers are not involved.</p>
        </div>
        <Button variant="secondary" size="lg" onClick={run}>
          Run the checks
        </Button>
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
