'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { parseEventLogs, type Hex } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { WalletButton } from '@/components/WalletButton'
import { Sigil } from '@/components/Sigil'
import { Button, Container, Pill, cx } from '@/components/ui'
import { identityRegistryAbi } from '@/lib/abi/erc8004'
import { presageAgentsAbi } from '@/lib/abi/PresageAgents'
import { deployment, erc8004, txUrl } from '@/lib/chain'
import { useFloor, useSession } from '@/lib/client/hooks'
import { ORACLE_ASSETS } from '@/lib/oracle-assets'
import { TEMPLATES } from '@/lib/spec/templates'
import type { StrategySpec } from '@/lib/spec/schema'
import { pct, price as fmtPrice, short } from '@/lib/client/format'

type Described = { markets: string; rules: string[] }
type Check = { symbol: string; fires: boolean; checks: { ok: boolean; saw: string }[]; blocked: string | null; signal: { entry: { type: string; price: number }; stop: number; target: number; rr: number } | null }
type DeployStep = { key: string; label: string; tx?: string; done: boolean }

const DEFAULT_MARKETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
const EXAMPLES = [
  'Buy when 1-hour MFI is under 20 at 4-hour horizontal support, stop 3% below support, target 2R.',
  'In a daily uptrend, buy a 15-minute MFI bottom near the 1-hour 50 average. Stop 1.5 ATR, target the nearest resistance.',
  'Buy a 1-hour bullish divergence at the confirmed pattern support, stop under it, take profit at the first rejection point.',
  'Buy after price falls 8% in a day into 4-hour support with MFI below 25. Stop 2% under support, target 10%.',
]

export default function BuildPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signedIn, signIn } = useSession()
  const { data: floor } = useFloor(30_000)
  const stq = floor?.agents.find(a => a.slug === 'st-quant')

  const [prompt, setPrompt] = useState('')
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS)
  const [search, setSearch] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [spec, setSpec] = useState<StrategySpec | null>(null)
  const [described, setDescribed] = useState<Described | null>(null)
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [missing, setMissing] = useState<string[] | null>(null)
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priceUsd, setPriceUsd] = useState(3)
  const [confirmed, setConfirmed] = useState(false)
  const [steps, setSteps] = useState<DeployStep[] | null>(null)
  const [done, setDone] = useState<{ slug: string; id: number } | null>(null)

  const matches = useMemo(() => ORACLE_ASSETS.filter(a => !search || a.symbol.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase())).slice(0, 24), [search])

  const toggleMarket = (m: string) => setMarkets(prev => (prev.includes(m) ? prev.filter(x => x !== m) : prev.length >= 8 ? (toast.error('Up to 8 markets per agent'), prev) : [...prev, m]))

  const showSpec = async (s: StrategySpec, d?: Described, a: string[] = []) => {
    setSpec(s)
    setAssumptions(a)
    setMissing(null)
    setChecks(null)
    setConfirmed(false)
    const r = await fetch('/api/build/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: s }) })
    const j = await r.json()
    if (r.ok) {
      setDescribed(d ?? j.described)
      setChecks(j.results)
    } else toast.error(j.error)
  }

  const compile = async () => {
    setCompiling(true)
    setSpec(null)
    setMissing(null)
    try {
      const r = await fetch('/api/build/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, markets }) })
      const j = await r.json()
      if (!r.ok) {
        if (j.missing?.length) setMissing(j.missing)
        else toast.error(j.error ?? 'Could not compile that')
        return
      }
      await showSpec(j.spec, j.described, j.assumptions)
    } finally {
      setCompiling(false)
    }
  }

  const useTemplate = async (t: (typeof TEMPLATES)[number]) => {
    setPrompt(t.prompt)
    if (!name) setName(t.name)
    await showSpec({ ...t.spec, markets } as StrategySpec)
  }

  const deploy = async () => {
    if (!spec || !address || !publicClient || !deployment) return
    const plan: DeployStep[] = [
      { key: 'sign', label: 'Sign in with your wallet', done: signedIn },
      { key: 'mint', label: 'Mint the agent’s ERC-8004 identity', done: false },
      { key: 'seal', label: 'Seal the strategy in PresageAgents', done: false },
      { key: 'live', label: 'On the floor and the board', done: false },
    ]
    const mark = (key: string, patch: Partial<DeployStep>) => {
      const i = plan.findIndex(s => s.key === key)
      plan[i] = { ...plan[i], ...patch }
      setSteps([...plan])
    }
    setSteps([...plan])
    try {
      if (!signedIn) await signIn()
      mark('sign', { done: true })

      const dr = await fetch('/api/build/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, prompt, spec, priceUsd6: Math.round(priceUsd * 1e6) }),
      })
      const draft = await dr.json()
      if (!dr.ok) throw new Error(draft.error)

      const mintHash = await writeContractAsync({ address: erc8004.identity, abi: identityRegistryAbi, functionName: 'register', args: [draft.agentURI] })
      const mint = await publicClient.waitForTransactionReceipt({ hash: mintHash })
      const reg = parseEventLogs({ abi: identityRegistryAbi, eventName: 'Registered', logs: mint.logs })[0]
      if (!reg) throw new Error('The identity was not minted')
      mark('mint', { done: true, tx: mintHash, label: `Minted ERC-8004 identity #${reg.args.agentId}` })

      const sealHash = await writeContractAsync({
        address: deployment.agents,
        abi: presageAgentsAbi,
        functionName: 'register',
        args: [reg.args.agentId, 2, draft.specHash as Hex, draft.specURI, BigInt(Math.round(priceUsd * 1e6)), 0n],
      })
      await publicClient.waitForTransactionReceipt({ hash: sealHash })
      mark('seal', { done: true, tx: sealHash })

      const fr = await fetch('/api/build/finalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: draft.draftId, txHash: sealHash }) })
      const fin = await fr.json()
      if (!fr.ok) throw new Error(fin.error)
      mark('live', { done: true })
      setDone({ slug: fin.slug, id: fin.agentId })
      toast.success('Your agent is live')
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Failed'
      toast.error(msg.includes('User rejected') ? 'Cancelled' : msg)
    }
  }

  const firingNow = checks?.filter(c => c.fires).length ?? 0

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="build" />
      <Container className="py-8 space-y-6 max-w-5xl">
        {/* The challenge */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-8 border-2 border-purple-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
            <div>
              <Pill tone="gradient" className="mb-3">
                enter the arena
              </Pill>
              <h1 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight">
                <span className="text-purple-600">Deploy your own agent</span> 🧠
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl">
                Write your strategy the way you would explain it to a friend. Presage turns it into rules you confirm, runs it on live prices, and seals every call it makes on Metis. Nothing you write is ever run as code.
              </p>
            </div>
            {stq && (
              <Link href="/agents/st-quant" className="shrink-0 bg-white rounded-2xl border-2 border-gray-200 p-4 hover:border-gray-400 transition-colors md:w-64">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">The one to beat</div>
                <div className="flex items-center gap-3">
                  <Sigil id={stq.id} slug="st-quant" size={40} className="rounded-xl" />
                  <div>
                    <div className="font-bold text-black">{stq.name}</div>
                    <div className="text-xs text-gray-600">
                      {stq.record.calls} calls · hit {pct(stq.record.hitRate, 0)}
                    </div>
                  </div>
                </div>
              </Link>
            )}
          </div>

          <label className="text-sm text-gray-700 mb-2 block font-semibold">Your strategy</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Buy when 15-minute MFI is at its lowest at a rising 4-hour trendline. Stop below the line, target the last rejection."
            className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-black placeholder-gray-400 focus:border-purple-500 focus:outline-none resize-none mb-4"
            rows={4}
            disabled={compiling}
          />

          <label className="text-sm text-gray-700 mb-2 block font-semibold">Markets it watches ({markets.length}/8, priced on Binance)</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {markets.map(m => (
              <button key={m} onClick={() => toggleMarket(m)} className="px-3 py-1.5 rounded-lg font-bold text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                {ORACLE_ASSETS.find(a => a.market === m)?.symbol ?? m} ×
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Add a coin…" className="w-full sm:w-64 px-3 py-2 border-2 border-gray-300 rounded-xl text-sm mb-2 focus:border-purple-500 focus:outline-none" />
          {search && (
            <div className="flex flex-wrap gap-2 mb-4">
              {matches.map(a => (
                <button key={a.market} onClick={() => toggleMarket(a.market)} className={cx('px-3 py-1.5 rounded-lg text-sm font-semibold border', markets.includes(a.market) ? 'bg-black text-white' : 'bg-white border-gray-300 hover:border-purple-400')}>
                  {a.symbol}
                </button>
              ))}
            </div>
          )}

          <Button full variant="gradient" size="lg" onClick={compile} disabled={prompt.trim().length < 15 || compiling || !markets.length} className="mt-2">
            {compiling ? '🧠 Reading your strategy…' : '✨ Turn it into rules'}
          </Button>
        </motion.div>

        <div className="bg-white rounded-2xl p-6 border-2 border-gray-200">
          <h3 className="text-lg font-bold mb-4">💡 Start from a template</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => useTemplate(t)} className="bg-gradient-to-br from-blue-50 to-purple-50 p-4 rounded-xl border-2 border-blue-200 hover:border-purple-400 text-left transition-all hover:shadow-md">
                <div className="font-bold text-black mb-1">{t.name}</div>
                <div className="text-xs text-gray-600">{t.prompt}</div>
              </button>
            ))}
          </div>
          <h3 className="text-lg font-bold mb-3">…or try one of these</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setPrompt(ex)} className="bg-gray-50 p-3 rounded-xl border-2 border-gray-200 hover:border-purple-400 text-left text-sm transition-all">
                “{ex}”
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {missing && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-red-50 rounded-2xl p-6 border-2 border-red-300">
              <h3 className="text-xl font-bold text-black mb-2">✋ Presage can’t run that as written</h3>
              <p className="text-gray-700 mb-3">Rather than guess, here is what the strategy needs that Presage does not have yet:</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-800">
                {missing.map(m => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 mt-3">Reword it using money flow (MFI), supports, trendlines, averages, divergence, volume or price change, or start from a template.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {spec && described && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border-2 border-green-200 shadow-md">
                <h3 className="text-2xl font-bold text-black mb-1">✅ Here is what your agent will do</h3>
                <p className="text-gray-600 mb-4">Read it carefully. Once sealed, these rules can never change; a different strategy has to be a new agent.</p>
                <div className="text-sm text-gray-600 mb-2">Watches: {described.markets}</div>
                <ol className="list-decimal pl-6 space-y-2 text-gray-900">
                  {described.rules.map(r => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
                {assumptions.length > 0 && (
                  <div className="mt-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                    <div className="text-sm font-bold text-yellow-800 mb-1">Choices made where you left details open</div>
                    <ul className="list-disc pl-5 text-sm text-yellow-900 space-y-1">
                      {assumptions.map(a => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold">👀 What it sees right now</h3>
                  {checks && <Pill tone={firingNow ? 'gradient' : 'gray'}>{firingNow ? `${firingNow} would call now` : 'nothing firing yet'}</Pill>}
                </div>
                <p className="text-sm text-gray-600 mb-4">The same check the runner makes on every candle, on live prices. Nothing is sealed from this preview.</p>
                {!checks && <div className="text-sm text-gray-500">Checking the markets…</div>}
                <div className="grid md:grid-cols-2 gap-3">
                  {checks?.map(c => (
                    <div key={c.symbol} className={cx('rounded-xl p-4 border-2', c.fires ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50')}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black">{c.symbol}</span>
                        <Pill tone={c.fires ? 'green' : 'gray'}>{c.fires ? 'WOULD CALL NOW' : 'waiting'}</Pill>
                      </div>
                      <ul className="text-xs space-y-1">
                        {c.checks.map(ch => (
                          <li key={ch.saw} className={ch.ok ? 'text-green-700' : 'text-gray-500'}>
                            {ch.ok ? '✓' : '·'} {ch.saw}
                          </li>
                        ))}
                        {c.blocked && <li className="text-orange-700">⚠ {c.blocked}</li>}
                      </ul>
                      {c.signal && (
                        <div className="text-xs mt-2 font-semibold text-black">
                          entry {fmtPrice(c.signal.entry.price)} · stop {fmtPrice(c.signal.stop)} · target {fmtPrice(c.signal.target)} · {c.signal.rr}R
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-200">
                <h3 className="text-xl font-bold text-black mb-4">🪪 Name it and price it</h3>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">Name</label>
                    <input value={name} onChange={e => setName(e.target.value)} maxLength={48} placeholder="Trendline Sniper" className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">Backers pay per 30 days (USD, minimum $2)</label>
                    <input type="number" min={2} max={500} step={0.5} value={priceUsd} onChange={e => setPriceUsd(Number(e.target.value))} className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none" />
                  </div>
                </div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">One line about it (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} maxLength={400} placeholder="Buys exhaustion at rising trendlines on the majors." className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl mb-4 focus:border-purple-500 focus:outline-none" />
                <div className="bg-white rounded-xl p-4 border border-purple-200 text-sm text-gray-700 mb-4 space-y-1">
                  <div>• Your agent becomes an ERC-8004 identity owned by your wallet, with its own mark on the floor.</div>
                  <div>• Every call it makes is sealed on Metis before the outcome, losses included, and stays on your profile for good.</div>
                  <div>• It can take backers after 10 scored calls over 7 days. You get 80% of every backer, claimed from your own wallet.</div>
                  <div>• Signals only: it never trades anyone’s money.</div>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-black mb-4 cursor-pointer">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-4 h-4" />
                  These are the rules I want sealed.
                </label>
                {!isConnected ? (
                  <WalletButton />
                ) : (
                  <Button full size="lg" onClick={deploy} disabled={!confirmed || name.trim().length < 3 || priceUsd < 2 || Boolean(steps && !done)}>
                    🚀 Deploy: two transactions on Metis
                  </Button>
                )}
              </div>

              {steps && (
                <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-md space-y-3">
                  {steps.map(s => (
                    <div key={s.key} className={cx('flex items-center justify-between rounded-xl p-3', s.done ? 'bg-green-50' : 'bg-gray-50')}>
                      <span className="font-semibold">
                        {s.done ? '✅' : '⏳'} {s.label}
                      </span>
                      {s.tx && (
                        <a href={txUrl(s.tx)} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-700 underline">
                          {short(s.tx, 6)}
                        </a>
                      )}
                    </div>
                  ))}
                  {done && (
                    <Button full variant="gradient" size="lg" href={`/agents/${done.slug}`}>
                      See your agent on the floor →
                    </Button>
                  )}
                </div>
              )}

              <details className="bg-gray-50 rounded-2xl p-4 border-2 border-gray-200">
                <summary className="cursor-pointer font-bold text-sm">The exact spec that gets sealed</summary>
                <pre className="mt-3 text-xs overflow-x-auto">{JSON.stringify(spec, null, 2)}</pre>
              </details>
            </motion.div>
          )}
        </AnimatePresence>
      </Container>
    </div>
  )
}
