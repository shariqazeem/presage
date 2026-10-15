'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { erc20Abi, formatUnits } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { WalletButton } from '@/components/WalletButton'
import { Sigil } from '@/components/Sigil'
import { CallRow, IdentityCard, RecordBar, RecordProgress } from '@/components/agents'
import { EventFeed, RadarTable, StatusChip } from '@/components/floor'
import { Button, Container, FormDots, Pill, Skeleton, Stat, Streak, cx } from '@/components/ui'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens } from '@/lib/chain'
import { useAgent, useSession, useTelegramLink } from '@/lib/client/hooks'
import { pct, result, short, usd6, when } from '@/lib/client/format'
import type { CallView } from '@/lib/server/records'

export default function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { data, isLoading, refetch } = useAgent(slug)

  if (isLoading)
    return (
      <Shell>
        <Skeleton className="h-28 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </Shell>
    )
  if (!data)
    return (
      <Shell>
        <div className="py-24 text-center">
          <div className="text-6xl mb-4">🤷</div>
          <div className="text-2xl font-black">No agent called “{slug}”</div>
        </div>
      </Shell>
    )

  const { agent: a, calls, rules, persona, status, radar, events } = data
  const r = a.record
  const isSetup = a.kind === 'setup'
  const firing = radar.filter(x => x.state === 'firing')
  const hiddenFiring = firing.filter(x => !x.symbol).length

  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={88} className="rounded-3xl shadow-xl shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-4xl sm:text-5xl font-black text-black tracking-tight">{a.name}</h1>
                {a.house && <Pill tone="black">house</Pill>}
                {a.retired && <Pill tone="gray">retired</Pill>}
                <Streak streak={r.streak} />
              </div>
              <p className="text-xl text-gray-700 italic mt-1">“{persona.tagline}”</p>
              <div className="text-sm text-gray-500 mt-2">
                ERC-8004 #{a.id} · {isSetup ? 'trade setups' : 'direction calls'} · by {a.house ? 'Presage' : <Link className="underline font-mono" href={`/creators/${a.creator}`}>{short(a.creator)}</Link>}
                {a.registeredAt ? ` · since ${when(a.registeredAt)}` : ''}
              </div>
              <div className="mt-3 inline-flex bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
                <StatusChip status={status} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch lg:items-end gap-2 shrink-0">
            {a.slug === 'oracle' ? (
              <Button href="/oracle" size="lg">
                🔮 Ask the Oracle · $0.05
              </Button>
            ) : a.priceUsd6 ? (
              <Button href="#subscribe" size="lg">
                {a.recordReady ? `🔔 Back it · ${usd6(a.priceUsd6)} / 30 days` : '👀 Follow the record'}
              </Button>
            ) : null}
            {!a.house && (
              <Button href="/build" size="sm" variant="ghost">
                Build one that beats it →
              </Button>
            )}
          </div>
        </div>
        <p className="text-lg text-gray-700 mt-6 max-w-4xl leading-relaxed">{persona.thesis}</p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Stat icon="🔒" value={r.calls} label="Calls sealed" sub={`${r.open} open`} />
        <Stat icon="🎯" value={pct(r.hitRate)} label="Hit rate" sub="wins over wins, losses, forfeits" delay={0.05} />
        <Stat icon="📏" value={r.avgResult == null ? '—' : result(a.kind, Math.round(r.avgResult))} label={isSetup ? 'Average R' : 'Average move'} tone={(r.avgResult ?? 0) < 0 ? 'red' : (r.avgResult ?? 0) > 0 ? 'green' : 'default'} delay={0.1} />
        <Stat icon="❌" value={r.losses} label="Losses" tone={r.losses ? 'red' : 'default'} delay={0.15} />
        <Stat icon="🚫" value={r.forfeited} label="Forfeited" sub="hidden calls count as losses" tone={r.forfeited ? 'red' : 'default'} delay={0.2} />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {isSetup && (
            <section className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                <h2 className="text-2xl font-black text-black">What it’s watching right now</h2>
                <span className="text-sm text-gray-500">
                  {radar.length} markets · <b className={cx(firing.length > 0 && 'text-purple-700')}>{firing.length} firing</b> · {radar.filter(x => x.state === 'close').length} close
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Every market through the thesis, closest to a setup first.{' '}
                {hiddenFiring > 0 ? `${hiddenFiring} firing ${hiddenFiring === 1 ? 'market is' : 'markets are'} hidden: ${a.recordReady ? 'backers see which, and the levels, the moment a call is sealed' : 'the coin shows when its call is revealed'}.` : ''}
              </p>
              <RadarTable rows={radar} limit={radar.length > 30 ? 30 : undefined} />
              {radar.length > 30 && <div className="text-xs text-gray-400 mt-2">Showing the 30 closest. The rest are quiet.</div>}
            </section>
          )}

          {a.slug === 'oracle' && (
            <section className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 rounded-2xl p-6 text-white shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black mb-1">Ask it about any of 84 coins</h2>
                  <p className="text-purple-100">It also calls BTC, ETH and METIS on its own every four hours, so the record below grows whether or not anyone asks.</p>
                </div>
                <Button href="/oracle" variant="secondary" size="lg">
                  Ask · $0.05
                </Button>
              </div>
            </section>
          )}

          <section className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="text-2xl font-black text-black">The record</h2>
              <div className="flex items-center gap-3">
                <FormDots form={r.form} />
                <span className="hidden sm:inline text-sm text-gray-500">
                  {r.wins} {r.wins === 1 ? 'win' : 'wins'} · {r.losses} {r.losses === 1 ? 'loss' : 'losses'} · {r.flats} flat · {r.noFills} no fill · {r.forfeited} forfeited
                </span>
              </div>
            </div>
            <RecordBar r={r} />
            <CumulativeChart kind={a.kind} calls={calls} />
            <p className="text-xs text-gray-500 mt-3">
              {isSetup ? 'Average R counts each forfeit as −1R and leaves out no-fills.' : 'Average move is the return in the called direction.'} Every number here is recomputable from the reveals on Metis.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-black mb-4">Every call</h2>
            {calls.length === 0 && <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-600 border-2 border-gray-200">No calls yet. The first one appears here the moment it is sealed.</div>}
            <div className="space-y-3">
              {calls.map((c, i) => (
                <CallRow key={c.id} c={c} index={i} showAgent={false} />
              ))}
            </div>
          </section>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          {a.priceUsd6 > 0 && <SubscribePanel agentId={a.id} priceUsd6={a.priceUsd6} ready={a.recordReady} retired={a.retired} onDone={() => refetch()} />}
          <RecordProgress a={a} />

          <section className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-5">
            <h3 className="text-lg font-bold text-black mb-3">Activity</h3>
            <EventFeed events={events} showAgent={false} compact max={12} />
          </section>

          <section className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-5">
            <h3 className="text-lg font-bold text-black mb-1">How it thinks</h3>
            {rules && <div className="text-sm text-gray-600 mb-3">Markets: {rules.markets}</div>}
            <ol className="space-y-2 text-sm text-gray-800 list-decimal pl-5">
              {persona.method.map(m => (
                <li key={m}>{m}</li>
              ))}
            </ol>
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-900">{persona.honest}</div>
            <a href={`/api/specs/${a.specHash}`} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm font-bold text-blue-700 hover:underline">
              Read the exact sealed spec →
            </a>
          </section>

          <IdentityCard a={a} />
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar />
      <Container className="py-8">{children}</Container>
      <Container className="pb-12 text-xs text-gray-500">Not financial advice. Past calls do not predict future ones.</Container>
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
  if (points.length < 2) return <div className="mt-4 h-36 flex items-center justify-center text-sm text-gray-400 bg-gray-50 rounded-xl">The curve appears after two scored calls.</div>
  const last = points.at(-1)!.total
  return (
    <div className="mt-4 h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis dataKey="n" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit={kind === 'setup' ? 'R' : '%'} />
          <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />
          <Tooltip formatter={v => [`${Number(v).toFixed(2)}${kind === 'setup' ? 'R' : '%'}`, 'Cumulative']} labelFormatter={n => `After call ${n}`} />
          <Line type="monotone" dataKey="total" stroke={last >= 0 ? '#7C3AED' : '#DC2626'} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SubscribePanel({ agentId, priceUsd6, ready, retired, onDone }: { agentId: number; priceUsd6: number; ready: boolean; retired: boolean; onDone: () => void }) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signedIn, signIn } = useSession()
  const openTelegram = useTelegramLink()
  const [token, setToken] = useState(payTokens[0].symbol)
  const [busy, setBusy] = useState(false)
  const t = payTokens.find(x => x.symbol === token) ?? payTokens[0]

  const { data: until, refetch: refetchUntil } = useReadContract({
    address: deployment?.market,
    abi: presageMarketAbi,
    functionName: 'subscribedUntil',
    args: address ? [BigInt(agentId), address] : undefined,
    query: { enabled: Boolean(address && deployment) },
  })
  const { data: quote } = useReadContract({
    address: deployment?.market,
    abi: presageMarketAbi,
    functionName: 'subscriptionQuote',
    args: [BigInt(agentId), t.address, 1],
    query: { enabled: Boolean(deployment) },
  })
  const active = until != null && Number(until) > Date.now() / 1000

  const subscribe = async () => {
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
      const hash = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'subscribe', args: [BigInt(agentId), t.address, 1, max], value: t.native ? max : 0n })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success('You’re backing this agent for 30 days')
      await refetchUntil()
      onDone()
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Failed'
      toast.error(msg.includes('User rejected') ? 'Cancelled' : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="subscribe" className="bg-white p-6 rounded-2xl border-2 border-purple-200 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-black text-black">🔔 Back this agent</h3>
        <div className="text-right">
          <div className="text-2xl font-black text-black">{usd6(priceUsd6)}</div>
          <div className="text-xs text-gray-500">per 30 days</div>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">Backers see every call the moment it is sealed, with entry, stop and target, and get it on Telegram. Everyone else sees it when it is revealed.</p>

      {!isConnected ? (
        <WalletButton />
      ) : active ? (
        <div className="space-y-3">
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 text-sm text-green-800 font-semibold">✓ Backing until {when(Number(until))}</div>
          {!signedIn && (
            <Button full onClick={() => signIn().catch(e => toast.error(e.message))}>
              ✍️ Sign in to see sealed calls
            </Button>
          )}
          <Button full variant="secondary" onClick={() => openTelegram().catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))}>
            ✈️ Get calls on Telegram
          </Button>
        </div>
      ) : retired ? (
        <div className="text-sm text-gray-600">This agent is retired and takes no new backers.</div>
      ) : !ready ? (
        <div className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">Backing opens once the record is long enough. Until then every call shows here when it is revealed, and you can follow the floor for free.</div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {payTokens.map(p => (
              <button key={p.symbol} onClick={() => setToken(p.symbol)} className={cx('flex-1 px-3 py-2 rounded-xl font-bold text-sm', token === p.symbol ? 'bg-black text-white' : 'bg-white border border-gray-300 text-gray-700')}>
                {p.symbol}
              </button>
            ))}
          </div>
          <Button full variant="gradient" onClick={subscribe} disabled={busy || quote == null}>
            {busy ? 'Confirm in your wallet…' : `Back it · ${quote != null ? `${Number(formatUnits(quote, t.decimals)).toFixed(t.native ? 4 : 2)} ${t.symbol}` : '…'}`}
          </Button>
          <div className="text-xs text-gray-500">80% goes to the agent’s creator and 20% to Presage, split by the contract. Not financial advice.</div>
        </div>
      )}
    </div>
  )
}
