'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, formatUnits, type Address, type Hex } from 'viem'
import { useAccount, useBalance, usePublicClient, useWriteContract } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Sigil } from '@/components/Sigil'
import { PingButton } from '@/components/Ping'
import { MyCalls } from '@/components/MyCalls'
import { Share } from '@/components/Share'
import { IconBack, IconChevron, IconLock, IconRefund, IconShare } from '@/components/icons'
import { ActionButton, At, CountdownRing, Eyebrow, Panel, PanelHead, Sheet, StatusLine } from '@/components/kit'
import { Change, CoinPicker, MyCall, Segmented, Sparkline, VoteBoard, stageLine, type Coin } from '@/components/oracle'
import { FormDots, cx } from '@/components/ui'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens } from '@/lib/chain'
import { HORIZONS, type Horizon } from '@/lib/oracle'
import { useAgent } from '@/lib/client/hooks'
import { saveQuestion, useMyQuestions, type OracleAnswer, type Progress } from '@/lib/client/mine'
import { autoWatch } from '@/lib/client/push'
import { pct, price as fmtPrice } from '@/lib/client/format'

type Accept = { scheme: string; network: string; maxAmountRequired: string; payTo: Address; asset: Address; extra: { agentId: number; requestId: Hex; symbol: string; decimals: number; native: boolean } }
type Phase = 'ask' | 'quote' | 'approve' | 'sign' | 'confirm' | 'vote' | 'done'

const PHASE_LINE: Record<Phase, string> = {
  ask: '',
  quote: 'Getting the price',
  approve: 'Approve the token once',
  sign: 'Confirm in your wallet',
  confirm: 'Paying into escrow',
  vote: '',
  done: '',
}

const HORIZON_OPTIONS: { value: Horizon; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: '24h', label: '1 day' },
]

const tokenLabel = (s: string) => s.replace(/^m\./, '')

export default function OraclePage() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { data: oracle } = useAgent('oracle')
  const { data: market } = useQuery({ queryKey: ['tickers'], queryFn: async () => (await (await fetch('/api/market/tickers')).json()) as { coins: Coin[] }, refetchInterval: 30_000 })
  const coins = market?.coins ?? []

  const [coin, setCoin] = useState('BTC')
  const [horizon, setHorizon] = useState<Horizon>('4h')
  const [myCall, setMyCall] = useState<'up' | 'down' | null>(null)
  const [token, setToken] = useState(payTokens[0].symbol)
  const [phase, setPhase] = useState<Phase>('ask')
  const [voters, setVoters] = useState<string[]>([])
  const [live, setLive] = useState<Progress | null>(null)
  const [answer, setAnswer] = useState<OracleAnswer | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      const c = localStorage.getItem('presage_oracle_coin')
      if (c) setCoin(c)
    } catch {}
    return () => stop()
  }, [])
  const pick = (s: string) => {
    setCoin(s)
    try {
      localStorage.setItem('presage_oracle_coin', s)
    } catch {}
  }

  const { data: spark } = useQuery({ queryKey: ['spark', coin], queryFn: async () => (await (await fetch(`/api/market/spark/${coin}`)).json()) as { closes: number[] }, refetchInterval: 60_000 })
  const { data: prices } = useQuery({
    queryKey: ['oracle-price'],
    queryFn: async () => (await (await fetch('/api/oracle/price')).json()) as { prices: { symbol: string; amount: string | null; decimals: number; native: boolean }[] },
    refetchInterval: 60_000,
  })
  const priceOf = (symbol: string) => prices?.prices.find(p => p.symbol === symbol)
  const payable = (symbol: string) => !prices || prices.prices.length === 0 || priceOf(symbol)?.amount != null
  // If the chosen token can't be priced right now, move to one that can before anyone presses Ask.
  useEffect(() => {
    if (prices?.prices.length && !payable(token)) {
      const ok = payTokens.find(t => payable(t.symbol))
      if (ok) setToken(ok.symbol)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, token])
  const selected = coins.find(c => c.symbol === coin)
  const payToken = payTokens.find(t => t.symbol === token) ?? payTokens[0]
  const { data: balance } = useBalance({ address, token: payToken.native ? undefined : payToken.address, query: { enabled: Boolean(address) } })
  const { items } = useMyQuestions(address)
  const record = oracle?.agent.record
  const busy = phase !== 'ask' && phase !== 'done'

  const stop = () => {
    if (poll.current) clearInterval(poll.current)
    poll.current = null
  }

  const ask = async () => {
    if (!isConnected || !address) return openConnectModal?.()
    if (!publicClient) return
    setAnswer(null)
    setLive(null)
    setVoters([])
    const asking = { coin, horizon, myCall }
    try {
      setPhase('quote')
      const r = await fetch('/api/oracle/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset: asking.coin, horizon: asking.horizon, wallet: address, myCall: asking.myCall }) })
      const q = await r.json()
      if (r.status !== 402) throw new Error(q.error ?? 'The Oracle did not return a price')
      setVoters(q.voters ?? [])
      const req: Accept | undefined = q.accepts.find((a: Accept) => a.extra.symbol === payToken.symbol)
      if (!req) throw new Error(`${tokenLabel(payToken.symbol)} isn’t accepted right now. Try another token.`)
      const amount = BigInt(req.maxAmountRequired)
      if (!req.extra.native) {
        const allowance = await publicClient.readContract({ address: req.asset, abi: erc20Abi, functionName: 'allowance', args: [address, req.payTo] })
        if (allowance < amount) {
          setPhase('approve')
          const h = await writeContractAsync({ address: req.asset, abi: erc20Abi, functionName: 'approve', args: [req.payTo, amount * 20n] })
          await publicClient.waitForTransactionReceipt({ hash: h })
        }
      }
      setPhase('sign')
      const maxAmount = req.extra.native ? (amount * 101n) / 100n : amount
      const txHash = await writeContractAsync({
        address: req.payTo,
        abi: presageMarketAbi,
        functionName: 'payForCall',
        args: [BigInt(req.extra.agentId), req.extra.requestId, req.asset, maxAmount],
        value: req.extra.native ? maxAmount : 0n,
      })
      setPhase('confirm')
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      saveQuestion(address, { requestId: req.extra.requestId, secret: q.secret, asset: asking.coin, horizon: asking.horizon, at: Date.now(), myCall: asking.myCall })

      setPhase('vote')
      setLive({ stage: 'reading', votes: [], voters: q.voters ?? [] })
      const url = `/api/oracle/call/${req.extra.requestId}?secret=${encodeURIComponent(q.secret)}`
      poll.current = setInterval(async () => {
        try {
          const a = (await (await fetch(url)).json()) as OracleAnswer
          if (a.progress) setLive(a.progress)
        } catch {}
      }, 900)

      const header = btoa(JSON.stringify({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { requestId: req.extra.requestId, txHash } }))
      let res = await fetch('/api/oracle/call', { method: 'POST', headers: { 'content-type': 'application/json', 'X-PAYMENT': header }, body: JSON.stringify({ secret: q.secret }) })
      let ans = (await res.json()) as OracleAnswer
      for (let i = 0; i < 40 && res.status === 202; i++) {
        await new Promise(r => setTimeout(r, 2000))
        res = await fetch(url)
        ans = await res.json()
        if (ans.call || ans.status === 'failed') break
      }
      stop()
      if (!ans.call) throw new Error(ans.error ? `The Oracle could not answer: ${ans.error}. Your $0.05 comes back from escrow.` : 'It wasn’t sealed in time. Your $0.05 comes back from escrow after 15 minutes.')
      setAnswer(ans)
      setPhase('done')
      setMyCall(null)
      // If pings are already allowed here, this call pings when it opens without asking again.
      void autoWatch('call', ans.call.id, address)
    } catch (e) {
      stop()
      setPhase('ask')
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Something went wrong'
      toast.error(/User rejected|User denied/i.test(msg) ? 'Cancelled. Nothing was paid.' : msg)
    }
  }

  const mine = useMemo(() => items.filter(i => i.saved.requestId !== answer?.requestId), [items, answer])
  const opensAt = Math.floor(Date.now() / 1000) + HORIZONS[horizon].seconds
  const showVote = phase !== 'ask'

  const header = (
    <div className="flex items-center gap-3">
      <Sigil id={oracle?.agent.id ?? 0} slug="oracle" size={44} className="rounded-2xl shadow-lg shadow-pink-500/10 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-heading text-lg md:text-xl font-black leading-tight text-black">Market Oracle</div>
        <div className="text-[12px] md:text-[13px] text-gray-500 truncate">
          {record?.resolved ? (
            <>
              {record.resolved} scored · right {pct(record.hitRate, 0)}
              {record.streak >= 2 && <span className="text-green-600 font-bold"> · {record.streak} in a row</span>}
            </>
          ) : (
            'Four AIs vote · sealed on Metis'
          )}
        </div>
      </div>
      <button onClick={() => setHowOpen(true)} className="text-[12px] font-bold text-gray-600 border-2 border-gray-100 rounded-full px-3 py-1.5 hover:border-gray-300 shrink-0">
        How it works
      </button>
    </div>
  )

  const askPanel = (
    <div>
      <h1 className="font-heading text-[30px] md:text-[40px] leading-[1.05] font-black tracking-tight text-black mt-5 md:mt-6">Where’s it heading?</h1>
      <div className="mt-4">
        <CoinPicker coins={coins} selected={coin} onSelect={pick} />
      </div>
      <div className="mt-4 rounded-3xl bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-gray-500 font-semibold truncate">{selected?.name ?? coin} · now</div>
            <div className="flex items-baseline gap-2">
              <div className="font-heading text-[32px] leading-none font-black tabular-nums text-black mt-1">{selected ? `$${fmtPrice(selected.price)}` : '—'}</div>
              <Change v={selected?.changePct} className="text-sm" />
            </div>
          </div>
          <Sparkline closes={spark?.closes ?? []} />
        </div>
        <div className="mt-4">
          <Segmented value={horizon} options={HORIZON_OPTIONS} onChange={setHorizon} />
          <div className="text-[12px] text-gray-500 mt-2 px-1">
            Opens at <At sec={opensAt} />
            {horizon === '24h' ? ' tomorrow' : ''} · moves under {HORIZONS[horizon].flatBandBps / 100}% count as flat
          </div>
        </div>
        <div className="mt-4">
          <MyCall value={myCall} onChange={setMyCall} />
        </div>
      </div>
      <div className="mt-4 space-y-2 text-[13px] text-gray-600 font-medium px-1">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 grid place-items-center text-[11px] font-black">{Math.max(voters.length, 4)}</span>
          AIs vote live, in front of you
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 grid place-items-center">
            <IconLock size={11} weight={2.6} />
          </span>
          Sealed on Metis before the move
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 grid place-items-center">
            <IconRefund size={11} weight={2.6} />
          </span>
          Your $0.05 comes back if it fails
        </div>
      </div>
      {isConnected && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-[12px] text-gray-500 min-w-0">
            {(() => {
              const p = priceOf(token)
              const cost = p?.amount ? Number(formatUnits(BigInt(p.amount), p.decimals)) : null
              return (
                <>
                  {cost != null ? (
                    <b className="text-gray-800">
                      {cost.toLocaleString('en-US', { maximumFractionDigits: p!.native ? 4 : 2, minimumFractionDigits: p!.native ? 0 : 2 })} {tokenLabel(token)}
                    </b>
                  ) : (
                    'Pay with'
                  )}
                  {balance ? <> · you have {Number(formatUnits(balance.value, balance.decimals)).toLocaleString('en-US', { maximumFractionDigits: payToken.native ? 3 : 2 })}</> : null}
                </>
              )
            })()}
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-gray-100 shrink-0">
            {payTokens.map(t => {
              const ok = payable(t.symbol)
              return (
                <button
                  key={t.symbol}
                  onClick={() => ok && setToken(t.symbol)}
                  disabled={!ok}
                  title={ok ? undefined : `${tokenLabel(t.symbol)} can’t be priced right now`}
                  className={cx('px-2.5 py-1 rounded-lg text-[12px] font-black transition-all', token === t.symbol ? 'bg-white text-black shadow-sm' : ok ? 'text-gray-500' : 'text-gray-300 line-through')}
                >
                  {tokenLabel(t.symbol)}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="hidden md:block mt-4">
        <ActionButton tone="grad" onClick={ask} disabled={busy || !deployment}>
          {!deployment ? 'Opens when Presage is live on Metis' : !isConnected ? 'Connect a wallet to ask' : `Ask about ${coin} · $0.05`}
        </ActionButton>
      </div>
    </div>
  )

  const votePanel = (
    <VotePanel
      phase={phase}
      coin={answer?.call?.asset ?? coin}
      horizon={answer?.horizon ?? horizon}
      voters={voters.length ? voters : live?.voters ?? []}
      live={live}
      answer={answer}
      onAgain={() => {
        setPhase('ask')
        setAnswer(null)
        setLive(null)
      }}
    />
  )

  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-4 md:pt-8">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-10 gap-y-6">
        <div className={cx('md:col-span-6 lg:col-span-5', showVote && 'hidden md:block')}>
          {header}
          {askPanel}
        </div>

        <div className={cx('md:col-span-6 lg:col-span-7 space-y-4', !showVote && 'hidden md:block')}>
          {votePanel}
          {!busy && (mine.length > 0 || phase === 'ask') && (
            <Panel className="px-4 md:px-5 pt-4 pb-1">
              <PanelHead title="Your calls" sub={mine.length ? 'Saved on this device. Each opens when its time is up.' : undefined} />
              {mine.length === 0 ? (
                <div className="py-5 text-sm text-gray-500">Nothing yet. Your questions and how they came out live here.</div>
              ) : (
                <MyCalls items={mine} max={8} />
              )}
            </Panel>
          )}
          {phase === 'ask' && oracle && (
            <Panel tone="soft" className="p-4 md:p-5 hidden md:block">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Eyebrow>The Oracle’s own record</Eyebrow>
                  <div className="text-sm text-gray-600 mt-1.5">
                    <StatusLine status={oracle.status} />
                  </div>
                </div>
                <FormDots form={oracle.agent.record.form} />
              </div>
              <Link href="/agents/oracle" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-black hover:underline">
                Every call it has made <IconChevron size={14} />
              </Link>
            </Panel>
          )}
        </div>
      </div>

      {/* The one action, always in reach on a phone. */}
      {!showVote && (
        <>
          <div className="md:hidden h-20" />
          <div className="md:hidden fixed left-5 right-5 above-tabs z-40">
            <ActionButton tone="grad" onClick={ask} disabled={!deployment}>
              {!deployment ? 'Opens when Presage is live' : !isConnected ? 'Connect a wallet to ask' : `Ask about ${coin} · $0.05`}
            </ActionButton>
          </div>
        </>
      )}

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="How the Oracle works">
        <HowItWorks horizon={horizon} />
      </Sheet>
    </div>
  )
}

function VotePanel({ phase, coin, horizon, voters, live, answer, onAgain }: { phase: Phase; coin: string; horizon: string; voters: string[]; live: Progress | null; answer: OracleAnswer | null; onAgain: () => void }) {
  const c = answer?.call
  const paying = phase === 'quote' || phase === 'approve' || phase === 'sign' || phase === 'confirm'
  const label = HORIZONS[horizon as Horizon]?.label ?? horizon
  if (phase === 'ask') {
    return (
      <Panel className="p-5 md:p-6">
        <Eyebrow>The vote</Eyebrow>
        <div className="font-heading text-2xl font-black mt-1.5 text-black">Four AIs, one answer, sealed before the move.</div>
        <p className="text-sm text-gray-600 mt-2 max-w-lg">
          A quant model and three AI models each read the same facts from Binance and vote up or down. You watch every vote land. The majority is sealed on Metis, and when time is up, price decides who was right.
        </p>
        <div className="mt-5 opacity-80 pointer-events-none">
          <VoteBoard voters={['presage-quant-v1', 'openai/gpt', 'anthropic/claude', 'x-ai/grok']} votes={[]} final={false} />
        </div>
      </Panel>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between h-10 md:h-auto">
        <button onClick={phase === 'done' ? onAgain : undefined} className={cx('flex items-center gap-1.5 font-bold text-[15px] text-black', phase !== 'done' && 'cursor-default')}>
          {phase === 'done' && <IconBack size={18} className="text-gray-400 md:hidden" />}
          {coin} · next {label}
        </button>
        <span className={cx('px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1', phase === 'done' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600')}>
          {phase === 'done' ? (
            <>
              <IconLock size={12} weight={2.6} /> Sealed
            </>
          ) : paying ? (
            PHASE_LINE[phase]
          ) : (
            stageLine(live)
          )}
          {phase !== 'done' && <span className="soft-pulse">…</span>}
        </span>
      </div>

      <Panel className="p-4 md:p-5 mt-3">
        {paying && (
          <div className="mb-4 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-pink-500 soft-pulse" />
            {phase === 'sign' ? 'Confirm the $0.05 payment in your wallet. It sits in escrow until the call opens.' : phase === 'approve' ? 'One approval lets the next 20 calls go through with a single signature.' : phase === 'confirm' ? 'Paying into escrow on Metis…' : 'Getting the price from the contract…'}
          </div>
        )}
        <VoteBoard
          voters={voters}
          votes={(c ? c.models.map(m => ({ ...m, why: live?.votes.find(v => v.model === m.model)?.why })) : live?.votes) ?? []}
          final={phase === 'done'}
        />
      </Panel>

      <AnimatePresence>
        {c && answer && (
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="mt-4">
            <AnswerCard a={answer} />
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <PingButton target="call" id={c.id} />
              <Share path={c.receipt} text={`I asked Presage’s Oracle about ${c.asset}: ${c.direction.toUpperCase()} over ${c.horizonSec / 3600}h, sealed on Metis before the move.`} compact />
            </div>
            <div className="mt-3 flex items-center justify-between text-[13px] px-1">
              <button onClick={onAgain} className="font-bold text-black hover:underline">
                Ask about another coin
              </button>
              <Link href={c.receipt} className="font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                Receipt <IconChevron size={14} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AnswerCard({ a }: { a: OracleAnswer }) {
  const c = a.call!
  const up = c.direction === 'up'
  const opensAt = c.issuedAt + c.horizonSec
  const opened = c.status === 'revealed' && c.outcome
  const agree = a.myCall ? a.myCall === c.direction : null
  return (
    <div className="rounded-[28px] grad p-[2px] shadow-xl shadow-pink-500/10">
      <div className="rounded-[26px] bg-white p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>The Oracle says</Eyebrow>
            <div className={cx('font-heading text-[60px] md:text-[72px] leading-none font-black tracking-tight mt-1.5', up ? 'text-green-600' : 'text-red-600')}>{up ? '↑ UP' : '↓ DOWN'}</div>
            <div className="text-sm font-bold text-gray-700 mt-2">
              {c.confidence}% sure · from <span className="tabular-nums">${fmtPrice(c.priceAtIssue)}</span>
            </div>
          </div>
          {!opened && (
            <div className="text-center">
              <CountdownRing from={c.issuedAt} to={opensAt} size={70} />
              <div className="text-[11px] text-gray-500 font-bold mt-1">
                opens <At sec={opensAt} />
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 text-[15px] leading-snug text-gray-700">
          <b className="text-black">Why:</b> {c.why}
        </div>
        {opened ? (
          <div className={cx('mt-4 rounded-2xl px-4 py-3 font-bold text-[14px]', c.outcome === 'win' ? 'bg-green-50 text-green-800' : c.outcome === 'loss' ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700')}>
            {c.outcome === 'win' ? 'It was right.' : c.outcome === 'loss' ? 'It was wrong.' : 'Flat: it barely moved.'} ${fmtPrice(c.priceAtIssue)} → ${c.exitPrice != null ? fmtPrice(c.exitPrice) : '…'}
          </div>
        ) : agree != null ? (
          <div className={cx('mt-4 rounded-2xl px-4 py-2.5 text-[13.5px] font-semibold', agree ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900')}>
            {agree ? `You said ${a.myCall} too. Let’s see who’s right.` : `You said ${a.myCall}. The Oracle disagrees. One of you is about to be right.`}
          </div>
        ) : null}
        <div className="mt-3 text-[12px] text-gray-500">Under {c.flatBandBps / 100}% either way counts as flat. Not financial advice.</div>
      </div>
    </div>
  )
}

function HowItWorks({ horizon }: { horizon: Horizon }) {
  const rows = [
    ['You pay $0.05', 'In METIS, USDC or USDT, from your own wallet. It sits in escrow on Metis, not with us.'],
    ['Four voters read the market', 'A quant model that always votes the same way on the same facts, and three AI models. Each sees the same facts from public Binance candles and votes up or down.'],
    ['The answer is sealed', 'Its fingerprint goes on Metis before the time starts. Nobody, us included, can change it or pretend it said something else.'],
    ['Price decides', `When time is up it opens and is scored against Binance’s price. Moves under ${HORIZONS[horizon].flatBandBps / 100}% (for ${HORIZONS[horizon].label}) count as flat.`],
    ['If anything fails, you get it back', 'Not sealed within 15 minutes, or not opened in time: your $0.05 comes back from escrow, and a missed opening counts as a loss on the Oracle’s record.'],
  ]
  return (
    <div>
      <div className="space-y-4">
        {rows.map(([t, d], i) => (
          <div key={t} className="flex gap-3">
            <span className="w-7 h-7 rounded-full grad text-white grid place-items-center text-[13px] font-black shrink-0">{i + 1}</span>
            <div>
              <div className="font-bold text-black">{t}</div>
              <div className="text-sm text-gray-600 mt-0.5">{d}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">An AI forecast with a public record, nothing more. Short-term calls are close to coin flips, and the record will say so. Not financial advice.</div>
      <Link href="/agents/oracle" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-black hover:underline">
        <IconShare size={14} /> See every call the Oracle has made
      </Link>
    </div>
  )
}
