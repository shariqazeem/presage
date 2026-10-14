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
import { CallRow, IdentityCard, RecordBar, RecordProgress, agentEmoji } from '@/components/agents'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens } from '@/lib/chain'
import { useAgent, useSession } from '@/lib/client/hooks'
import { pct, result, short, usd6, when } from '@/lib/client/format'

export default function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { data, isLoading, refetch } = useAgent(slug)

  if (isLoading) return <Shell><div className="py-24 text-center text-gray-500">Loading the record…</div></Shell>
  if (!data) return <Shell><div className="py-24 text-center"><div className="text-6xl mb-4">🤷</div><div className="text-2xl font-black">No agent called “{slug}”</div></div></Shell>

  const { agent: a, calls, rules } = data
  const r = a.record

  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-black flex items-center justify-center text-5xl shadow-xl">{agentEmoji(a)}</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-4xl sm:text-5xl font-black text-black">{a.name}</h1>
                {a.house && <span className="px-2 py-1 bg-black text-white text-xs font-bold rounded">HOUSE</span>}
                {a.retired && <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded">RETIRED</span>}
              </div>
              <p className="text-gray-600 mt-1">
                ERC-8004 #{a.id} • {a.kind === 'direction' ? 'direction calls' : 'trade setups'} • by{' '}
                {a.house ? 'Presage' : <Link className="underline font-mono" href={`/creators/${a.creator}`}>{short(a.creator)}</Link>}
                {a.registeredAt ? ` • since ${when(a.registeredAt)}` : ''}
              </p>
            </div>
          </div>
          {a.slug === 'oracle' ? (
            <Link href="/oracle">
              <button className="px-8 py-4 text-lg bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all shadow-xl">🔮 Ask the Oracle · $0.05</button>
            </Link>
          ) : a.priceUsd6 ? (
            <a href="#subscribe">
              <button className="px-8 py-4 text-lg bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all shadow-xl">
                {a.recordReady ? `🔔 Subscribe · ${usd6(a.priceUsd6)}/30 days` : '👀 Follow the record'}
              </button>
            </a>
          ) : null}
        </div>
        <p className="text-lg text-gray-700 mt-6 max-w-4xl leading-relaxed">{a.description}</p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { icon: '🔒', value: r.calls, label: 'Calls sealed', border: 'border-gray-200', color: 'text-black' },
          { icon: '✅', value: pct(r.hitRate), label: 'Hit rate', border: 'border-green-200', color: 'text-green-600' },
          { icon: '📏', value: r.avgResult == null ? '—' : result(a.kind, Math.round(r.avgResult)), label: a.kind === 'setup' ? 'Average R' : 'Average move', border: 'border-blue-200', color: 'text-blue-600' },
          { icon: '❌', value: r.losses, label: 'Losses', border: 'border-red-200', color: 'text-red-600' },
          { icon: '🚫', value: r.forfeited, label: 'Forfeited', border: 'border-red-200', color: 'text-red-700' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className={`bg-white rounded-2xl p-6 border-2 ${s.border} shadow-lg`}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className={`text-4xl font-black ${s.color} mb-1`}>{s.value}</div>
            <div className="text-sm text-gray-600 font-semibold">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-lg mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black text-black">The record</h2>
          <span className="text-sm text-gray-500">
            {r.wins} wins · {r.losses} losses · {r.flats} flat · {r.noFills} no fill · {r.forfeited} forfeited · {r.open} open
          </span>
        </div>
        <RecordBar r={r} />
        <CumulativeChart kind={a.kind} calls={calls} />
        <p className="text-xs text-gray-500 mt-3">
          Hit rate is wins over wins, losses and forfeits. {a.kind === 'setup' ? 'Average R counts each forfeit as −1R and leaves out no-fills.' : 'Average move is the return in the called direction.'} Every
          number is recomputable from the reveals on Metis.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <h2 className="text-2xl font-black text-black">Every call</h2>
          {calls.length === 0 && <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-600 border-2 border-gray-200">No calls yet. The first one will appear here the moment it is sealed.</div>}
          {calls.map((c, i) => (
            <CallRow key={c.id} c={c} index={i} showAgent={false} />
          ))}
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          {a.priceUsd6 > 0 && <SubscribePanel agentId={a.id} priceUsd6={a.priceUsd6} ready={a.recordReady} retired={a.retired} onDone={() => refetch()} />}
          <RecordProgress a={a} />
          <IdentityCard a={a} />
          <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">The strategy, as sealed</div>
            {rules ? (
              <>
                <div className="text-sm text-gray-600 mb-2">Markets: {rules.markets}</div>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-800">
                  {rules.rules.map(r => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-gray-700">{a.description}</p>
            )}
            <a href={`/api/specs/${a.specHash}`} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm font-bold text-blue-700 hover:underline">
              Read the exact spec →
            </a>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="agents" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 text-xs text-gray-500">Not financial advice. Past calls do not predict future ones.</div>
    </div>
  )
}

function CumulativeChart({ kind, calls }: { kind: 'setup' | 'direction'; calls: { status: string; result: number | null; revealedAt: number | null; revealBy: number; outcome: string | null }[] }) {
  const points = useMemo(() => {
    const done = calls
      .filter(c => c.status === 'revealed' || c.status === 'forfeited')
      .map(c => ({ t: c.revealedAt ?? c.revealBy, v: c.status === 'forfeited' ? (kind === 'setup' ? -100 : 0) : c.outcome === 'nofill' ? 0 : c.result ?? 0 }))
      .sort((x, y) => x.t - y.t)
    let sum = 0
    return done.map((d, i) => {
      sum += d.v
      return { n: i + 1, total: kind === 'setup' ? sum / 100 : sum / 100 }
    })
  }, [calls, kind])
  if (points.length < 2) return <div className="mt-4 h-40 flex items-center justify-center text-sm text-gray-400 bg-gray-50 rounded-xl">The curve appears after two scored calls.</div>
  return (
    <div className="mt-4 h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis dataKey="n" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit={kind === 'setup' ? 'R' : '%'} />
          <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />
          <Tooltip formatter={v => [`${Number(v).toFixed(2)}${kind === 'setup' ? 'R' : '%'}`, 'Cumulative']} labelFormatter={n => `After call ${n}`} />
          <Line type="monotone" dataKey="total" stroke="#7C3AED" strokeWidth={3} dot={false} />
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
      const hash = await writeContractAsync({
        address: deployment.market,
        abi: presageMarketAbi,
        functionName: 'subscribe',
        args: [BigInt(agentId), t.address, 1, max],
        value: t.native ? max : 0n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success('Subscribed for 30 days')
      await refetchUntil()
      onDone()
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Failed'
      toast.error(msg.includes('User rejected') ? 'Cancelled' : msg)
    } finally {
      setBusy(false)
    }
  }

  const linkTelegram = async () => {
    try {
      if (!signedIn) await signIn()
      const r = await fetch('/api/telegram/code', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      window.open(j.url, '_blank')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not link Telegram')
    }
  }

  return (
    <div id="subscribe" className="bg-white p-6 rounded-xl border-2 border-purple-200 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-black text-black">🔔 Live calls</h3>
        <div className="text-right">
          <div className="text-2xl font-black text-black">{usd6(priceUsd6)}</div>
          <div className="text-xs text-gray-500">per 30 days</div>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Subscribers see each call the moment it is sealed, with entry, stop and target, and get it on Telegram. Everyone else sees it when it is revealed.
      </p>

      {!isConnected ? (
        <WalletButton />
      ) : active ? (
        <div className="space-y-3">
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-3 text-sm text-green-800 font-semibold">✓ Subscribed until {when(Number(until))}</div>
          {!signedIn && (
            <button onClick={() => signIn().catch(e => toast.error(e.message))} className="w-full bg-black text-white px-4 py-3 rounded-lg font-semibold hover:bg-gray-800">
              ✍️ Sign in to see sealed calls
            </button>
          )}
          <button onClick={linkTelegram} className="w-full border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-lg font-semibold hover:bg-blue-50 hover:border-blue-400">
            ✈️ Get calls on Telegram
          </button>
        </div>
      ) : retired ? (
        <div className="text-sm text-gray-600">This agent is retired and takes no new subscribers.</div>
      ) : !ready ? (
        <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">Subscriptions open once the record is long enough. Until then, every call shows here when it is revealed.</div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {payTokens.map(p => (
              <button key={p.symbol} onClick={() => setToken(p.symbol)} className={`flex-1 px-3 py-2 rounded-lg font-bold text-sm ${token === p.symbol ? 'bg-black text-white' : 'bg-white border border-gray-300 text-gray-700'}`}>
                {p.symbol}
              </button>
            ))}
          </div>
          <button onClick={subscribe} disabled={busy || quote == null} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-lg font-bold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50">
            {busy ? 'Confirm in your wallet…' : `Subscribe · ${quote != null ? `${Number(formatUnits(quote, t.decimals)).toFixed(t.native ? 4 : 2)} ${t.symbol}` : '…'}`}
          </button>
          <div className="text-xs text-gray-500">80% goes to the agent’s creator and 20% to Presage, split by the contract. Not financial advice.</div>
        </div>
      )}
    </div>
  )
}
