'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { erc20Abi, formatUnits } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Sigil } from '@/components/Sigil'
import { Share } from '@/components/Share'
import { PingButton } from '@/components/Ping'
import { IconChevron, IconExternal, IconLock } from '@/components/icons'
import { ActionButton, CallLine, CheckRow, Countdown, Eyebrow, Feed, Panel, PanelHead, RadarViz, StatusLine, radarChecks, radarCounts, useMounted } from '@/components/kit'
import { FormDots, Skeleton, cx } from '@/components/ui'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { addressUrl, deployment, erc8004, isMainnet, payTokens, txUrl } from '@/lib/chain'
import { useAgent, useFloor, useSession, useTelegramLink } from '@/lib/client/hooks'
import { pct, price as fmtPrice, short, usd6, when } from '@/lib/client/format'
import { RECORD_BAR, type AgentSummary } from '@/lib/records'
import type { RadarRow } from '@/lib/floor-types'
import type { CallView } from '@/lib/server/records'
import { HOUSE_PERSONAS } from '@/lib/personas'

const STATE_CHIP: Record<RadarRow['state'], { label: string; cls: string }> = {
  firing: { label: 'setting up', cls: 'grad text-white' },
  close: { label: 'close', cls: 'bg-purple-100 text-purple-700' },
  watching: { label: 'watching', cls: 'bg-gray-100 text-gray-600' },
  quiet: { label: 'quiet', cls: 'bg-gray-100 text-gray-400' },
}
const rank = (s: RadarRow['state']) => ({ firing: 3, close: 2, watching: 1, quiet: 0 })[s]

/** When ST Quant looks next: a minute after each 15-minute candle closes. */
const nextScan = (now: number) => {
  const n = Math.ceil((now - 60) / 900) * 900 + 60
  return n <= now ? n + 900 : n
}

export default function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { data, isLoading, refetch } = useAgent(slug)
  const { data: floor } = useFloor(30_000)
  const [sel, setSel] = useState<string | null>(null)
  const mounted = useMounted()

  if (isLoading)
    return (
      <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-6 md:pt-10">
        <Skeleton className="h-20 w-2/3" />
        <Skeleton className="h-[360px] mt-6 rounded-3xl" />
      </div>
    )
  if (!data && HOUSE_PERSONAS[slug]) return <Prelaunch slug={slug} />
  if (!data)
    return (
      <div className="max-w-xl mx-auto px-5 py-24 text-center">
        <div className="font-heading text-3xl font-black">No agent called “{slug}”</div>
        <Link href="/agents" className="inline-block mt-4 font-bold underline">
          See every agent
        </Link>
      </div>
    )

  const { agent: a, persona, status, radar, events, calls } = data
  const r = a.record
  const isSetup = a.kind === 'setup'
  const engineUp = floor?.engineUp ?? true
  const counts = radarCounts(radar)
  const sorted = [...radar].sort((x, y) => rank(y.state) - rank(x.state) || y.score - x.score)
  const selected = radar.find(x => x.ref === sel) ?? sorted.find(x => x.state === 'firing' || x.state === 'close') ?? null
  const unproven = a.slug === 'st-quant' || (!a.house && !a.recordReady)
  const rookie = !a.house && r.resolved < RECORD_BAR.calls
  const openSealed = calls.filter(c => c.status === 'sealed')

  const header = (
    <div className="flex items-start gap-4">
      <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={64} className="rounded-2xl md:rounded-3xl shadow-xl shadow-pink-500/10 shrink-0 md:w-[84px] md:h-[84px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-heading text-[28px] md:text-[44px] leading-none font-black tracking-tight text-black">{a.name}</h1>
          {a.house && <span className="px-2 py-0.5 rounded-full bg-black text-white text-[10px] font-black uppercase tracking-wide">house</span>}
          {rookie && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-wide">rookie</span>}
          {unproven && a.slug === 'st-quant' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wide">unproven</span>}
          {a.retired && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-wide">retired</span>}
          {r.streak >= 2 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-black">{r.streak} in a row</span>}
        </div>
        <p className="text-[14px] md:text-lg text-gray-600 italic mt-2 leading-snug">“{persona.tagline}”</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] md:text-sm text-gray-600">
          <StatusLine status={status} engineUp={engineUp} className="font-semibold text-gray-700 max-w-full" />
          {a.slug === 'st-quant' && mounted && engineUp && (
            <span className="text-gray-400">
              next look in <Countdown to={nextScan(Math.floor(Date.now() / 1000))} />
            </span>
          )}
        </div>
      </div>
      <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
        <Share compact path={`/agents/${a.slug}`} text={`${a.name} on Presage: every call sealed on Metis before the move, losses included.`} />
      </div>
    </div>
  )

  const sideCards = (
    <>
      {isSetup && <SealedCard a={a} open={openSealed} />}
      {a.slug === 'oracle' ? (
        <Panel className="p-5">
          <Eyebrow>Ask it yourself</Eyebrow>
          <div className="font-heading text-xl font-black mt-1.5">Any of 84 coins, $0.05 a call</div>
          <p className="text-sm text-gray-600 mt-1.5">It also calls BTC, ETH and METIS on its own every four hours, so this record keeps growing whether or not anyone asks.</p>
          <ActionButton href="/oracle" tone="grad" className="mt-4">
            Ask the Oracle
          </ActionButton>
        </Panel>
      ) : a.priceUsd6 > 0 ? (
        <BackCard a={a} onDone={() => refetch()} />
      ) : null}
    </>
  )

  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      {header}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 mt-6 md:mt-8">
        <div className="md:col-span-7 space-y-4">
          {isSetup && (
            <Panel className="p-4 md:p-6">
              <PanelHead
                title="What it’s watching"
                sub={`${counts.total || 'No'} markets · every one through its rules, closest to a setup in the middle`}
              />
              {radar.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-500">The radar fills in after its first look at the market.</div>
              ) : (
                <>
                  <div className="grid place-items-center pt-4 pb-2">
                    <div className="md:hidden">
                      <RadarViz rows={radar} size={300} onSelect={row => setSel(row.ref)} selected={selected?.ref ?? null} />
                    </div>
                    <div className="hidden md:block">
                      <RadarViz rows={radar} size={400} onSelect={row => setSel(row.ref)} selected={selected?.ref ?? null} />
                    </div>
                  </div>
                  <div className="flex justify-center flex-wrap gap-2 text-[11px] font-bold">
                    <span className="px-2.5 py-1 rounded-full grad text-white">{counts.firing} setting up</span>
                    <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">{counts.close} close</span>
                    <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{counts.watching + counts.quiet} quiet</span>
                  </div>
                  <AnimatePresence mode="wait">
                    {selected && <MarketDetail key={selected.ref} row={selected} />}
                  </AnimatePresence>
                  <div className="mt-4">
                    <Eyebrow>Closest right now</Eyebrow>
                    <div className="mt-1 divide-y divide-gray-100">
                      {sorted.slice(0, 6).map(row => {
                        const checks = radarChecks(row)
                        const ok = checks.filter(c => c.ok).length
                        return (
                          <button key={row.ref || Math.random()} onClick={() => setSel(row.ref)} className={cx('w-full flex items-center gap-3 py-2.5 text-left', selected?.ref === row.ref && 'bg-gray-50 -mx-2 px-2 rounded-xl')}>
                            <span className="font-black text-[15px] text-black w-20 truncate">{row.symbol ?? '🔒'}</span>
                            <span className={cx('px-2 py-0.5 rounded-full text-[10.5px] font-black', STATE_CHIP[row.state].cls)}>{STATE_CHIP[row.state].label}</span>
                            <span className="flex-1 text-[12.5px] text-gray-500 truncate text-right">
                              {!row.symbol ? 'sealed: the coin opens with the call' : row.state === 'firing' ? 'lines up' : `${ok} of ${checks.length} in place`}
                            </span>
                            <IconChevron size={14} className="text-gray-300 shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </Panel>
          )}

          <div className="md:hidden space-y-4">{sideCards}</div>

          <RecordPanel a={a} calls={calls} />

          <Panel className="px-4 md:px-6 pt-4 md:pt-5 pb-2">
            <PanelHead title="Every call" sub="Sealed before the move, opened after. Nothing is ever deleted." right={<Link href="/record" className="text-xs font-bold text-gray-500 hover:text-black">all agents</Link>} />
            {calls.length === 0 ? (
              <div className="py-8 text-sm text-gray-500 text-center">No calls yet. The first one shows here the moment it is sealed.</div>
            ) : (
              <CallsList calls={calls} />
            )}
          </Panel>
        </div>

        <div className="md:col-span-5 space-y-4">
          <div className="hidden md:block space-y-4">{sideCards}</div>

          <Panel className="px-4 md:px-5 pt-4 pb-1">
            <PanelHead title="Activity" right={<span className="text-[11px] font-bold text-gray-400">live</span>} />
            <Feed events={events} max={8} empty="Nothing yet. Its moves show here as they happen." />
          </Panel>

          <HowItThinks persona={persona} specHash={a.specHash} />
          <Identity a={a} />
          <div className="md:hidden">
            <Share path={`/agents/${a.slug}`} text={`${a.name} on Presage: every call sealed on Metis before the move, losses included.`} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MarketDetail({ row }: { row: RadarRow }) {
  const checks = radarChecks(row)
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4 rounded-2xl bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-heading text-xl font-black text-black">{row.symbol ?? 'A sealed market'}</span>
          <span className={cx('px-2 py-0.5 rounded-full text-[10.5px] font-black', STATE_CHIP[row.state].cls)}>{STATE_CHIP[row.state].label}</span>
          {row.source !== 'binance' && row.symbol && <span className="text-[10px] font-bold uppercase text-gray-400">{row.ref.split(':')[0]} pool</span>}
        </div>
        {row.symbol && <span className="text-sm font-bold text-gray-700 tabular-nums">${fmtPrice(row.price)}</span>}
      </div>
      {!row.symbol ? (
        <p className="text-sm text-gray-600 mt-2">It has a sealed call on this market. Which coin it is opens with the call, so nobody can trade on it early.</p>
      ) : (
        <>
          <div className="mt-2 grid sm:grid-cols-2 gap-x-4">
            {checks.map(c => (
              <CheckRow key={c.label} {...c} />
            ))}
          </div>
          {row.state === 'firing' ? (
            <p className="text-[12.5px] text-gray-600 mt-2">Everything lines up. Next it reads the chart, and only seals a call if the chart agrees.</p>
          ) : row.blocker ? (
            <p className="text-[12px] text-gray-500 mt-2">
              <span className="font-bold text-gray-600">Waiting on:</span> {row.blocker}
            </p>
          ) : null}
        </>
      )}
    </motion.div>
  )
}

function SealedCard({ a, open }: { a: AgentSummary; open: CallView[] }) {
  const visible = open.filter(c => !c.hidden)
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 grid place-items-center shrink-0">
          <IconLock size={18} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-black">{open.length ? `${open.length} ${open.length === 1 ? 'setup' : 'setups'} sealed and open` : 'No open setups right now'}</div>
          <div className="text-[12.5px] text-gray-500">{open.length ? (visible.length ? 'You can see the levels: you back this agent or built it.' : 'Entry, stop and target open to everyone when each one closes.') : 'When it finds one, it is sealed on Metis the same minute.'}</div>
        </div>
      </div>
      {visible.length > 0 && (
        <div className="mt-2 divide-y divide-gray-100">
          {visible.slice(0, 4).map(c => (
            <CallLine key={c.id} c={c} />
          ))}
        </div>
      )}
      {a.slug === 'st-quant' && <div className="mt-3 text-[12px] text-amber-800 bg-amber-50 rounded-xl px-3 py-2">ST Quant is unproven: it has never been shown to make money. Its record here starts the day it went live, and it may lose.</div>}
    </Panel>
  )
}

/** Backing an agent: live calls the moment they are sealed, and on Telegram. Opens once the record is long enough. */
function BackCard({ a, onDone }: { a: AgentSummary; onDone: () => void }) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signedIn, signIn } = useSession()
  const openTelegram = useTelegramLink()
  const [token, setToken] = useState(payTokens[0].symbol)
  const [busy, setBusy] = useState(false)
  const t = payTokens.find(x => x.symbol === token) ?? payTokens[0]
  const r = a.record
  const days = r.firstCallAt ? Math.floor((Date.now() / 1000 - r.firstCallAt) / 86_400) : 0

  const { data: until, refetch: refetchUntil } = useReadContract({
    address: deployment?.market,
    abi: presageMarketAbi,
    functionName: 'subscribedUntil',
    args: address ? [BigInt(a.id), address] : undefined,
    query: { enabled: Boolean(address && deployment) },
  })
  const { data: quote } = useReadContract({
    address: deployment?.market,
    abi: presageMarketAbi,
    functionName: 'subscriptionQuote',
    args: [BigInt(a.id), t.address, 1],
    query: { enabled: Boolean(deployment && a.recordReady) },
  })
  const active = until != null && Number(until) > Date.now() / 1000

  const subscribe = async () => {
    if (!isConnected) return openConnectModal?.()
    if (!address || !publicClient || !deployment || quote == null) return
    setBusy(true)
    try {
      if (!t.native) {
        const allowance = await publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: 'allowance', args: [address, deployment.market] })
        if (allowance < quote) {
          const h = await writeContractAsync({ address: t.address, abi: erc20Abi, functionName: 'approve', args: [deployment.market, quote] })
          await publicClient.waitForTransactionReceipt({ hash: h })
        }
      }
      const max = t.native ? (quote * 101n) / 100n : quote
      const hash = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'subscribe', args: [BigInt(a.id), t.address, 1, max], value: t.native ? max : 0n })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success(`You’re backing ${a.name} for 30 days`)
      await refetchUntil()
      onDone()
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Failed'
      toast.error(/User rejected|User denied/i.test(msg) ? 'Cancelled. Nothing was paid.' : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel tone="grad" className="p-5" as="div">
      <div id="back" className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow className="text-purple-600">Back it</Eyebrow>
          <div className="font-heading text-xl font-black mt-1">Every setup the moment it is sealed</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-heading text-2xl font-black">{usd6(a.priceUsd6)}</div>
          <div className="text-[11px] text-gray-500 font-semibold">per 30 days</div>
        </div>
      </div>
      <p className="text-[13px] text-gray-600 mt-2">Entry, stop and target the minute it fires, here and on Telegram. Everyone else sees them when the setup closes. {a.house ? '' : 'The creator gets 80%.'}</p>

      {active ? (
        <div className="mt-4 space-y-2">
          <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-800">Backing until {when(Number(until))}</div>
          {!signedIn && (
            <ActionButton onClick={() => signIn().catch(e => toast.error(e.message))} tone="black">
              Sign in to see the sealed levels
            </ActionButton>
          )}
          <button onClick={() => openTelegram().catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))} className="w-full h-12 rounded-2xl border-2 border-gray-200 font-bold text-sm hover:border-black">
            Get them on Telegram
          </button>
        </div>
      ) : a.retired ? (
        <div className="mt-4 text-sm text-gray-600">Retired. It takes no new backers, and its record stays here for good.</div>
      ) : !a.recordReady ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3 text-[12px] font-semibold text-gray-600">
            <Progress label="Scored calls" value={r.resolved} of={RECORD_BAR.calls} />
            <Progress label="Days live" value={days} of={RECORD_BAR.days} />
          </div>
          <p className="text-[12px] text-gray-500 mt-3">Backing opens after {RECORD_BAR.calls} scored calls over {RECORD_BAR.days} days. Nobody can sell an empty record, us included.</p>
          <PingButton target="agent" id={a.id} label="Tell me when it opens" className="w-full mt-3" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex gap-1 p-1 rounded-xl bg-gray-100">
            {payTokens.map(p => (
              <button key={p.symbol} onClick={() => setToken(p.symbol)} className={cx('flex-1 px-2.5 py-1.5 rounded-lg text-[12px] font-black transition-all', token === p.symbol ? 'bg-white text-black shadow-sm' : 'text-gray-500')}>
                {p.symbol.replace(/^m\./, '')}
              </button>
            ))}
          </div>
          <ActionButton tone="grad" onClick={subscribe} disabled={busy || (isConnected && quote == null)}>
            {busy ? 'Confirm in your wallet…' : !isConnected ? 'Connect a wallet to back it' : `Back it · ${quote != null ? `${Number(formatUnits(quote, t.decimals)).toFixed(t.native ? 4 : 2)} ${t.symbol.replace(/^m\./, '')}` : '…'}`}
          </ActionButton>
          <div className="text-[11.5px] text-gray-500">Split 80/20 between its creator and Presage by the contract. Not financial advice.</div>
        </div>
      )}
    </Panel>
  )
}

function Progress({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="text-black font-black tabular-nums">
          {Math.min(value, of)}/{of}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
        <motion.div className="h-full grad rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(1, value / of) * 100}%` }} />
      </div>
    </div>
  )
}

function RecordPanel({ a, calls }: { a: AgentSummary; calls: CallView[] }) {
  const r = a.record
  const decided = r.wins + r.losses + r.forfeited
  const isSetup = a.kind === 'setup'
  if (!decided) {
    return (
      <Panel tone="soft" className="p-5 md:p-6">
        <Eyebrow>The record</Eyebrow>
        <div className="font-heading text-xl md:text-2xl font-black mt-1.5">{r.calls ? 'Building its record' : 'No calls yet'}</div>
        <p className="text-sm text-gray-600 mt-1.5">
          {r.calls
            ? `${r.calls} sealed so far${r.open ? `, ${r.open} still open` : ''}${r.noFills ? `, ${r.noFills} expired without a fill` : ''}. Its first right-or-wrong shows here the moment one closes.`
            : 'Every call it makes will be sealed on Metis first, then scored by price here, losses included.'}
        </p>
      </Panel>
    )
  }
  return (
    <Panel className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>The record</Eyebrow>
          <div className="flex items-baseline gap-3 mt-1.5">
            <div className="font-heading text-[44px] md:text-[56px] leading-none font-black tracking-tight text-black tabular-nums">{pct(r.hitRate, 0)}</div>
            <div className="text-sm font-bold text-gray-500">{isSetup ? 'of trades won' : 'of calls right'}</div>
          </div>
        </div>
        <FormDots form={r.form} />
      </div>
      <div className="grid grid-cols-4 gap-2 mt-5">
        <Mini label={isSetup ? 'Won' : 'Right'} value={r.wins} tone="text-green-600" />
        <Mini label={isSetup ? 'Lost' : 'Wrong'} value={r.losses + r.forfeited} tone={r.losses + r.forfeited ? 'text-red-600' : 'text-black'} />
        <Mini label="Flat" value={r.flats + r.noFills} />
        <Mini label="Open" value={r.open} tone="text-purple-700" />
      </div>
      <CumulativeChart kind={a.kind} calls={calls} />
      <p className="text-[12px] text-gray-500 mt-3">
        {isSetup ? 'Average R counts a forfeit as −1R and leaves out setups that never filled.' : 'A move inside the flat band counts as neither right nor wrong.'} Every number here can be recomputed from the reveals on Metis. {r.forfeited ? `${r.forfeited} forfeited ${r.forfeited === 1 ? 'call counts' : 'calls count'} as ${r.forfeited === 1 ? 'a loss' : 'losses'}.` : ''}
      </p>
    </Panel>
  )
}

function Mini({ label, value, tone = 'text-black' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 py-2.5 text-center">
      <div className={cx('font-heading text-xl font-black tabular-nums', tone)}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-500">{label}</div>
    </div>
  )
}

function CumulativeChart({ kind, calls }: { kind: 'setup' | 'direction'; calls: CallView[] }) {
  const points = useMemo(() => {
    const done = calls
      .filter(c => c.status === 'revealed' || c.status === 'forfeited')
      .map(c => ({ t: c.revealedAt ?? c.revealBy, v: c.status === 'forfeited' ? (kind === 'setup' ? -100 : 0) : c.outcome === 'nofill' ? 0 : (c.result ?? 0) }))
      .sort((x, y) => x.t - y.t)
    let sum = 0
    return done.map((d, i) => {
      sum += d.v
      return { n: i + 1, total: sum / 100 }
    })
  }, [calls, kind])
  if (points.length < 2) return null
  const last = points.at(-1)!.total
  return (
    <div className="mt-5 h-40 -ml-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="n" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} unit={kind === 'setup' ? 'R' : '%'} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine y={0} stroke="#E5E7EB" strokeDasharray="4 4" />
          <Tooltip formatter={v => [`${Number(v).toFixed(2)}${kind === 'setup' ? 'R' : '%'}`, 'Running total']} labelFormatter={n => `After call ${n}`} contentStyle={{ borderRadius: 12, border: '2px solid #F3F4F6', fontSize: 12 }} />
          <Line type="monotone" dataKey="total" stroke={last >= 0 ? '#7C3AED' : '#DC2626'} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function CallsList({ calls }: { calls: CallView[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? calls : calls.slice(0, 10)
  return (
    <>
      <div className="divide-y divide-gray-100">
        {shown.map(c => (
          <CallLine key={c.id} c={c} />
        ))}
      </div>
      {calls.length > 10 && !all && (
        <button onClick={() => setAll(true)} className="w-full py-3 text-sm font-bold text-gray-600 hover:text-black">
          Show all {calls.length}
        </button>
      )}
    </>
  )
}

function HowItThinks({ persona, specHash }: { persona: { thesis: string; method: string[]; honest: string }; specHash: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Panel className="p-5">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <div>
          <Eyebrow>How it thinks</Eyebrow>
          <div className="text-[14px] text-gray-700 mt-1.5 leading-snug">{persona.thesis}</div>
        </div>
        <IconChevron size={18} className={cx('text-gray-400 shrink-0 ml-3 transition-transform', open && 'rotate-90')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <ol className="mt-4 space-y-2.5 text-[13px] text-gray-700 list-decimal pl-5">
              {persona.method.map(m => (
                <li key={m}>{m}</li>
              ))}
            </ol>
            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{persona.honest}</div>
            <a href={`/api/specs/${specHash}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-black hover:underline">
              The exact rules it sealed <IconExternal size={13} />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}

function Identity({ a }: { a: AgentSummary }) {
  const [open, setOpen] = useState(false)
  const scan = `https://www.8004scan.io/agents/${isMainnet ? 'metis' : 'metis-sepolia'}/${a.id}`
  const rows: [string, React.ReactNode][] = [
    ['Registry', <a key="r" className="font-mono underline" href={addressUrl(erc8004.identity)} target="_blank" rel="noreferrer">{short(erc8004.identity)}</a>],
    ['Made by', a.house ? 'Presage' : <Link key="c" className="font-mono underline" href={`/creators/${a.creator}`}>{short(a.creator)}</Link>],
    ['Rules fingerprint', <a key="s" className="font-mono underline" href={`/api/specs/${a.specHash}`} target="_blank" rel="noreferrer">{short(a.specHash, 6)}</a>],
    ...(a.registeredTx ? ([['Registered', <a key="t" className="font-mono underline" href={txUrl(a.registeredTx)} target="_blank" rel="noreferrer">{short(a.registeredTx, 6)}</a>]] as [string, React.ReactNode][]) : []),
    ['Agent card', <a key="a" className="underline" href={`/api/agents/${a.slug}/card`} target="_blank" rel="noreferrer">registration file</a>],
    ['Explorer', <a key="e" className="underline" href={scan} target="_blank" rel="noreferrer">8004scan</a>],
  ]
  return (
    <Panel className="p-5">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <div>
          <Eyebrow>On-chain identity</Eyebrow>
          <div className="text-[14px] text-gray-700 mt-1.5">
            ERC-8004 agent <b className="text-black">#{a.id}</b> on Metis{a.registeredAt ? ` · since ${when(a.registeredAt)}` : ''}
          </div>
        </div>
        <IconChevron size={18} className={cx('text-gray-400 shrink-0 ml-3 transition-transform', open && 'rotate-90')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 space-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-black">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[12px] text-gray-500">Its rules are sealed by their fingerprint. Changing a strategy means registering a new agent, so this record only ever belongs to this one.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}

/** A house agent before launch: who it is and how it thinks, and that its record starts the day it goes live. */
function Prelaunch({ slug }: { slug: string }) {
  const p = HOUSE_PERSONAS[slug]
  const name = slug === 'oracle' ? 'Market Oracle' : 'ST Quant'
  return (
    <div className="max-w-[1100px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <div className="flex items-start gap-4">
        <Sigil id={0} slug={slug} size={64} className="rounded-2xl md:rounded-3xl shadow-xl shadow-pink-500/10 shrink-0 md:w-[84px] md:h-[84px]" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-heading text-[28px] md:text-[44px] leading-none font-black tracking-tight text-black">{name}</h1>
            <span className="px-2 py-0.5 rounded-full bg-black text-white text-[10px] font-black uppercase tracking-wide">house</span>
            {slug === 'st-quant' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wide">unproven</span>}
          </div>
          <p className="text-[14px] md:text-lg text-gray-600 italic mt-2 leading-snug">“{p.tagline}”</p>
          <div className="mt-2.5 text-[13px] font-semibold text-purple-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" /> Starts the day Presage goes live on Metis
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 mt-6 md:mt-8">
        <div className="md:col-span-7 space-y-4">
          <Panel className="p-5 md:p-6">
            <PanelHead title={slug === 'st-quant' ? 'What it will watch' : 'What it will do'} />
            <div className="grid place-items-center py-6 opacity-40">
              <RadarViz rows={[]} size={220} />
            </div>
            <p className="text-sm text-gray-600 text-center max-w-md mx-auto">
              {slug === 'st-quant'
                ? 'Every 15 minutes it looks at 84 Binance markets and the busiest BSC and X Layer pools. Each one lands on this radar, closest to a setup in the middle, with a checklist anyone can read.'
                : 'Ask it about any of 84 coins and four AI voters answer in front of you. It also calls BTC, ETH and METIS on its own every four hours, so its record grows from day one.'}
            </p>
          </Panel>
          <Panel tone="soft" className="p-5 md:p-6">
            <Eyebrow>The record</Eyebrow>
            <div className="font-heading text-xl md:text-2xl font-black mt-1.5">Starts empty, on purpose</div>
            <p className="text-sm text-gray-600 mt-1.5">Every call it makes will be sealed on Metis before the market moves and scored here by price, losses included. Nothing gets deleted, and backing only opens after 10 scored calls over 7 days.</p>
          </Panel>
        </div>
        <div className="md:col-span-5 space-y-4">
          <Panel className="p-5">
            <Eyebrow>How it thinks</Eyebrow>
            <p className="text-[14px] text-gray-700 mt-1.5 leading-snug">{p.thesis}</p>
            <ol className="mt-4 space-y-2.5 text-[13px] text-gray-700 list-decimal pl-5">
              {p.method.map(m => (
                <li key={m}>{m}</li>
              ))}
            </ol>
            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{p.honest}</div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
