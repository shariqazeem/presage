'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { parseEventLogs, type Hex } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Sigil } from '@/components/Sigil'
import { Share } from '@/components/Share'
import { IconCheck, IconPencil, IconPlus, IconX } from '@/components/icons'
import { ActionButton, Eyebrow, Panel, Sealed } from '@/components/kit'
import { cx } from '@/components/ui'
import { identityRegistryAbi } from '@/lib/abi/erc8004'
import { calledAgentsAbi } from '@/lib/abi/CalledAgents'
import { deployment, erc8004, txUrl } from '@/lib/chain'
import { useSession } from '@/lib/client/hooks'
import { ORACLE_ASSETS } from '@/lib/oracle-assets'
import { STYLES, type Style } from '@/lib/spec/templates'
import { plainCondition, plainPlan } from '@/lib/spec/describe'
import type { StrategySpec } from '@/lib/spec/schema'

type Check = { symbol: string; market: string; fires: boolean; checks: { ok: boolean; saw: string }[]; blocked: string | null }
type Step = { key: string; label: string; tx?: string; done: boolean; active?: boolean }

const DEFAULT_MARKETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
const symbolOf = (m: string) => ORACLE_ASSETS.find(a => a.market === m)?.symbol ?? m.replace(/USDT$/, '')

export default function BuildPage() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signedIn, signIn } = useSession()

  const [pick, setPick] = useState<string>(STYLES[0].id)
  const [own, setOwn] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [compiled, setCompiled] = useState<{ spec: StrategySpec; assumptions: string[] } | null>(null)
  const [missing, setMissing] = useState<string[] | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [preview, setPreview] = useState<Check[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [name, setName] = useState('')
  const [priceUsd, setPriceUsd] = useState(3)
  const [confirmed, setConfirmed] = useState(false)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [done, setDone] = useState<{ slug: string; id: number } | null>(null)

  const style = STYLES.find(s => s.id === pick) ?? STYLES[0]
  // The spec in play: the one compiled from your own words, or the chosen style on your markets.
  const spec: StrategySpec | null = own ? (compiled ? { ...compiled.spec, markets } : null) : ({ ...style.spec, markets } as StrategySpec)
  const plan = spec ? plainPlan(spec) : null

  useEffect(() => {
    if (!own && !name) setName(`My ${style.name.replace(/^The /, '')}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, own])

  // Run the rules on live prices whenever they change: what you see is exactly what it will run.
  const specKey = spec ? JSON.stringify(spec) : ''
  useEffect(() => {
    if (!spec) return setPreview(null)
    let stale = false
    setPreviewing(true)
    setConfirmed(false)
    fetch('/api/build/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) })
      .then(r => r.json())
      .then(j => !stale && setPreview(j.results ?? null))
      .catch(() => !stale && setPreview(null))
      .finally(() => !stale && setPreviewing(false))
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey])

  const compile = async () => {
    if (prompt.trim().length < 12) return toast.error('Say a bit more about how it should trade')
    setCompiling(true)
    setMissing(null)
    try {
      const r = await fetch('/api/build/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, markets }) })
      const j = await r.json()
      if (!r.ok) {
        if (j.missing?.length) setMissing(j.missing)
        else toast.error(j.error ?? 'Could not turn that into rules')
        return
      }
      setCompiled({ spec: j.spec, assumptions: j.assumptions ?? [] })
      // A name left over from a style no longer fits rules written in your own words.
      if (!name || STYLES.some(st => name === `My ${st.name.replace(/^The /, '')}`)) setName('My agent')
    } finally {
      setCompiling(false)
    }
  }

  const toggleMarket = (m: string) =>
    setMarkets(prev => (prev.includes(m) ? (prev.length > 1 ? prev.filter(x => x !== m) : prev) : prev.length >= 8 ? (toast.error('Up to 8 coins per agent'), prev) : [...prev, m]))
  const matches = useMemo(() => ORACLE_ASSETS.filter(a => !markets.includes(a.market) && (!search || a.symbol.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase()))).slice(0, 12), [search, markets])

  const deploy = async () => {
    if (!isConnected) return openConnectModal?.()
    if (!spec || !address || !publicClient || !deployment) return
    const s: Step[] = [
      { key: 'sign', label: 'Sign in with your wallet', done: signedIn },
      { key: 'mint', label: 'Mint its ERC-8004 identity on Metis', done: false },
      { key: 'seal', label: 'Seal its rules on Metis', done: false },
      { key: 'live', label: 'Start watching the market', done: false },
    ]
    const mark = (key: string, patch: Partial<Step>) => {
      const i = s.findIndex(x => x.key === key)
      s[i] = { ...s[i], ...patch }
      setSteps([...s])
    }
    setSteps([...s])
    try {
      if (!signedIn) {
        mark('sign', { active: true })
        await signIn()
      }
      mark('sign', { done: true, active: false })
      const dr = await fetch('/api/build/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: own ? prompt.trim() : style.blurb, prompt: own ? prompt.trim() : style.prompt, spec, priceUsd6: Math.round(priceUsd * 1e6) }),
      })
      const draft = await dr.json()
      if (!dr.ok) throw new Error(draft.error)

      mark('mint', { active: true })
      const mintHash = await writeContractAsync({ address: erc8004.identity, abi: identityRegistryAbi, functionName: 'register', args: [draft.agentURI] })
      const mint = await publicClient.waitForTransactionReceipt({ hash: mintHash })
      const reg = parseEventLogs({ abi: identityRegistryAbi, eventName: 'Registered', logs: mint.logs })[0]
      if (!reg) throw new Error('The identity was not minted')
      mark('mint', { done: true, active: false, tx: mintHash, label: `Minted ERC-8004 identity #${reg.args.agentId}` })

      mark('seal', { active: true })
      const sealHash = await writeContractAsync({
        address: deployment.agents,
        abi: calledAgentsAbi,
        functionName: 'register',
        args: [reg.args.agentId, 2, draft.specHash as Hex, draft.specURI, BigInt(Math.round(priceUsd * 1e6)), 0n],
      })
      await publicClient.waitForTransactionReceipt({ hash: sealHash })
      mark('seal', { done: true, active: false, tx: sealHash })

      mark('live', { active: true })
      const fr = await fetch('/api/build/finalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: draft.draftId, txHash: sealHash }) })
      const fin = await fr.json()
      if (!fr.ok) throw new Error(fin.error)
      mark('live', { done: true, active: false })
      setDone({ slug: fin.slug, id: fin.agentId })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Failed'
      toast.error(/User rejected|User denied/i.test(msg) ? 'Cancelled. Nothing was sent.' : msg)
      setSteps(null)
    }
  }

  if (done) return <Live slug={done.slug} id={done.id} name={name} markets={markets} />

  const firing = preview?.filter(p => p.fires) ?? []
  // Close means most of its rules already hold: two of three, three of four.
  const close = preview?.filter(p => !p.fires && p.checks.length >= 2 && p.checks.filter(c => c.ok).length / p.checks.length >= 0.66) ?? []
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

  const previewCard = (
    <div className="rounded-[20px] bg-ink text-white p-5">
      <div className="flex items-center justify-between">
        <Eyebrow className="text-[#9C9CA3] flex items-center gap-2">
          <span className={cx('w-1.5 h-1.5 rounded-full', spec ? 'foil soft-pulse' : 'bg-[#3F3F46]')} />
          Live preview
        </Eyebrow>
        <span className="label !text-[9px] text-[#6B6B72]">not a call</span>
      </div>
      {!spec ? (
        <div className="font-heading text-lg font-black tight mt-2 text-[#6B6B72]">Describe it and turn it into rules to see it work.</div>
      ) : previewing && !preview ? (
        <div className="font-heading text-lg font-black tight mt-2 text-[#6B6B72] soft-pulse">Running its rules on live prices…</div>
      ) : (
        <>
          <div className="font-heading text-lg md:text-xl font-black tight mt-2 leading-snug">
            {firing.length ? (
              <>
                Right now it would buy <Sealed>{list(firing.map(f => f.symbol))}</Sealed>
              </>
            ) : close.length ? (
              <>
                Right now it would be close on <span className="text-[#C9C9CF]">{list(close.slice(0, 3).map(f => f.symbol))}</span>
              </>
            ) : (
              <>Nothing lines up right now. It waits, which is the point.</>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {(preview ?? []).slice(0, 8).map(p => {
              const ok = p.checks.filter(c => c.ok).length
              return (
                <div key={p.market} className="flex items-center gap-3">
                  <span className="w-14 font-heading font-black text-[13px]">{p.symbol}</span>
                  <div className="flex-1 flex gap-1">
                    {p.checks.map((c, i) => (
                      <span key={i} title={`${spec.when[i] ? plainCondition(spec.when[i]) : ''}: ${c.saw}`} className={cx('h-1.5 flex-1 rounded-full', p.fires ? 'foil' : c.ok ? 'bg-white' : 'bg-white/15')} />
                    ))}
                  </div>
                  <span className={cx('w-16 text-right', p.fires ? 'label !text-[9px] text-white' : 'num text-[11.5px] text-[#8A8A92]')}>{p.fires ? 'would buy' : `${ok}/${p.checks.length}`}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-10 gap-y-5">
        <div className="md:col-span-7">
          <h1 className="font-heading text-[30px] md:text-[48px] leading-[1.03] font-black tight text-ink text-balance">
            Build an agent that <span className="text-ink-3">trades your way.</span>
          </h1>
          <p className="text-[14px] md:text-lg text-ink-2 mt-2 max-w-xl">Pick a style, then make it yours. It runs on live prices, and every call it makes is sealed on Metis before the market moves.</p>

          <div className="mt-5 grid grid-cols-2 gap-2.5 md:gap-3">
            {STYLES.map(s => (
              <StyleCard key={s.id} style={s.style} name={s.name} blurb={s.blurb} on={!own && pick === s.id} onClick={() => (setOwn(false), setPick(s.id), setMissing(null))} />
            ))}
            <button onClick={() => setOwn(true)} className={cx('rounded-[18px] p-3.5 md:p-4 text-left transition-all col-span-2 bg-white', own ? 'border border-ink ring-1 ring-ink' : 'border border-dashed border-line hover:border-[#C9C9CF]')}>
              <div className="flex items-center gap-3">
                <span className={cx('w-11 h-11 rounded-[14px] grid place-items-center shrink-0 transition-colors', own ? 'bg-ink text-white' : 'bg-paper-2 text-ink-2')}>
                  <IconPencil size={20} />
                </span>
                <div>
                  <div className="font-heading font-black tight text-[15px] text-ink">In your own words</div>
                  <div className="text-[12.5px] text-ink-3 leading-snug">Describe it like you would to a friend. Called turns it into rules you check before anything runs.</div>
                </div>
              </div>
            </button>
          </div>

          <AnimatePresence>
            {own && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <Panel className="p-4 mt-3">
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="Buy when the 15-minute money flow bottoms out right at 4-hour support. Stop just under the support, take profit at the last rejection."
                    className="w-full resize-none outline-none text-[15px] text-ink placeholder:text-ink-3 leading-relaxed"
                  />
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {STYLES.slice(0, 2).map(s => (
                        <button key={s.id} onClick={() => setPrompt(s.prompt)} className="text-[11.5px] font-semibold text-ink-3 bg-paper-2 rounded-full px-2.5 py-1 hover:text-ink">
                          start from {s.name.replace(/^The /, '')}
                        </button>
                      ))}
                    </div>
                    <button onClick={compile} disabled={compiling} className="h-10 px-4 rounded-[12px] bg-ink text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#26262A] disabled:opacity-60 shrink-0 transition-colors">
                      {compiling ? 'Reading…' : 'Turn into rules →'}
                    </button>
                  </div>
                </Panel>
                {missing && (
                  <div className="mt-3 rounded-[14px] border border-line px-4 py-3 text-[13px] text-ink-2">
                    <b className="text-ink">It can’t do this yet:</b> {missing.join('; ')}. Called only runs rules it can check on live prices, so it says no rather than guess.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {spec && plan && (
            <Panel className="p-4 md:p-5 mt-4">
              <Eyebrow>Its rules</Eyebrow>
              <div className="mt-2 space-y-1">
                {spec.when.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
                    <span className="w-5 h-5 rounded-full bg-ink text-white grid place-items-center num text-[10px] font-semibold shrink-0">{i + 1}</span>
                    {plainCondition(c)}
                  </div>
                ))}
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
                <div>· {plan.entry}</div>
                <div>· {plan.stop}</div>
                <div>· {plan.target}</div>
                <div>· {plan.hold}</div>
              </div>
              {own && compiled?.assumptions.length ? (
                <details className="mt-3 text-[12px] text-ink-3">
                  <summary className="cursor-pointer font-semibold text-ink-2">What it filled in for you ({compiled.assumptions.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {compiled.assumptions.map(a => (
                      <li key={a}>· {a}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Panel>
          )}

          <div className="md:hidden mt-4">{previewCard}</div>

          <Panel className="p-4 md:p-5 mt-4">
            <div className="flex items-center justify-between">
              <Eyebrow>Coins it watches</Eyebrow>
              <span className="label !text-[9.5px] text-ink-3">{markets.length}/8 · priced on Binance</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {markets.map(m => (
                <button key={m} onClick={() => toggleMarket(m)} className="h-9 pl-3 pr-2 rounded-full bg-ink text-white text-sm font-semibold flex items-center gap-1.5">
                  {symbolOf(m)} <IconX size={13} className="opacity-60" />
                </button>
              ))}
              {markets.length < 8 && (
                <button onClick={() => setAdding(a => !a)} className="h-9 px-3 rounded-full border border-dashed border-[#C9C9CF] text-sm font-semibold text-ink-2 flex items-center gap-1 hover:border-ink hover:text-ink">
                  <IconPlus size={13} /> add
                </button>
              )}
            </div>
            <AnimatePresence>
              {adding && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search 84 coins" className="mt-3 w-full h-11 rounded-[12px] bg-paper-2 border border-line px-4 outline-none text-sm font-medium focus:border-ink" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {matches.map(a => (
                      <button key={a.market} onClick={() => toggleMarket(a.market)} className="h-8 px-3 rounded-full border border-line text-[13px] font-semibold hover:border-ink">
                        {a.symbol}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        </div>

        <div className="md:col-span-5">
          <div className="md:sticky md:top-24 space-y-4">
            <div className="hidden md:block">{previewCard}</div>
            <Panel className="p-5">
              <label className="block">
                <Eyebrow>Name it</Eyebrow>
                <input value={name} onChange={e => setName(e.target.value.slice(0, 40))} className="mt-2 w-full h-12 rounded-[12px] bg-paper-2 border border-line px-4 outline-none font-semibold text-ink focus:border-ink" placeholder="My Dip Buyer" />
              </label>
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <Eyebrow>Price to back it</Eyebrow>
                  <span className="label !text-[9.5px] text-ink-3">you keep 80%</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {[2, 3, 5, 10].map(p => (
                    <button key={p} onClick={() => setPriceUsd(p)} className={cx('flex-1 h-11 rounded-[12px] num text-sm font-semibold transition-all', priceUsd === p ? 'bg-ink text-white' : 'bg-paper-2 text-ink-2 hover:text-ink')}>
                      ${p}
                    </button>
                  ))}
                </div>
                <div className="text-[11.5px] text-ink-3 mt-2">Per 30 days. Backing opens once it has 10 scored calls over 7 days.</div>
              </div>
              <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 w-4 h-4 accent-black" />
                <span className="text-[12.5px] text-ink-2">These rules are what I mean. Once sealed they can’t change; a new strategy is a new agent, and every call stays on its record.</span>
              </label>

              {steps ? (
                <div className="mt-4 space-y-2">
                  {steps.map(st => (
                    <div key={st.key} className={cx('flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm border', st.active ? 'border-ink bg-white text-ink' : st.done ? 'border-transparent bg-paper-2 text-ink' : 'border-transparent bg-paper-2 text-ink-3')}>
                      <span className={cx('w-5 h-5 rounded-full grid place-items-center shrink-0', st.done ? 'bg-ink text-white' : st.active ? 'border border-ink' : 'border border-[#C9C9CF]')}>
                        {st.done ? <IconCheck size={11} weight={3.2} /> : st.active ? <span className="w-2 h-2 rounded-full foil soft-pulse" /> : null}
                      </span>
                      <span className="flex-1 font-semibold">{st.label}</span>
                      {st.tx && (
                        <a href={txUrl(st.tx)} target="_blank" rel="noreferrer" className="label !text-[9.5px] underline">
                          tx
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <ActionButton className="mt-4" onClick={deploy} disabled={!spec || !confirmed || name.trim().length < 3 || !deployment}>
                  {!deployment ? 'Opens when Called is live on Metis' : !isConnected ? 'Connect a wallet to deploy' : 'Deploy on Metis · 2 signatures'}
                </ActionButton>
              )}
              <div className="text-[11px] text-ink-3 mt-3">Two transactions from your own wallet: its identity, then its rules. Only gas, a fraction of a cent on Metis.</div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

const STYLE_ART: Record<Style, string> = {
  dip: '<polyline points="4,10 18,16 30,30 40,38 52,33 62,22 74,12" fill="none" stroke="url(#ID)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" y1="40" x2="76" y2="40" stroke="#B4B4BA" stroke-width="2" stroke-dasharray="4 4"/><circle cx="40" cy="38" r="4" fill="#0B0B0C"/>',
  breakout: '<line x1="4" y1="18" x2="76" y2="18" stroke="#B4B4BA" stroke-width="2" stroke-dasharray="4 4"/><polyline points="4,38 16,24 26,32 38,22 48,28 58,14 74,4" fill="none" stroke="url(#ID)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="58" cy="14" r="4" fill="#0B0B0C"/>',
  trend: '<polyline points="4,40 18,28 26,33 40,20 48,25 62,11 74,6" fill="none" stroke="url(#ID)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" y1="44" x2="76" y2="12" stroke="#B4B4BA" stroke-width="2" stroke-dasharray="4 4"/><circle cx="48" cy="25" r="4" fill="#0B0B0C"/>',
  reversal: '<polyline points="4,6 16,14 26,26 34,38 42,30 50,36 60,22 74,12" fill="none" stroke="url(#ID)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="34" cy="38" r="4" fill="#0B0B0C"/><circle cx="50" cy="36" r="4" fill="none" stroke="#0B0B0C" stroke-width="2"/>',
}

function StyleCard({ style, name, blurb, on, onClick }: { style: Style; name: string; blurb: string; on: boolean; onClick: () => void }) {
  const id = `st-${style}`
  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={onClick} className={cx('rounded-[18px] p-3.5 md:p-4 text-left transition-all bg-white border', on ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-[#C9C9CF]')}>
      {/* The chosen style's line turns to foil; the rest stay in ink. */}
      <svg
        width="80"
        height="48"
        viewBox="0 0 80 48"
        aria-hidden
        dangerouslySetInnerHTML={{
          __html: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${on ? '<stop offset="0" stop-color="#7C3AED"/><stop offset=".45" stop-color="#EC4899"/><stop offset=".8" stop-color="#3B82F6"/><stop offset="1" stop-color="#22D3EE"/>' : '<stop offset="0" stop-color="#0B0B0C"/><stop offset="1" stop-color="#0B0B0C"/>'}</linearGradient></defs>${STYLE_ART[style].replaceAll('ID', id)}`,
        }}
      />
      <div className="font-heading font-black tight text-[15px] text-ink mt-2">{name}</div>
      <div className="text-[12px] text-ink-3 leading-snug mt-0.5">{blurb}</div>
    </motion.button>
  )
}

function Live({ slug, id, name, markets }: { slug: string; id: number; name: string; markets: string[] }) {
  return (
    <div className="max-w-xl mx-auto px-5 pt-12 md:pt-20 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="inline-block">
        <div className="p-[3px] rounded-[31px] foil">
          <Sigil id={id} size={112} className="rounded-[28px] block" />
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Eyebrow className="text-ink-3 mt-6">ERC-8004 agent #{id} on Metis · yours</Eyebrow>
        <h1 className="font-heading text-[34px] md:text-[48px] leading-none font-black tight mt-2">{name} is live</h1>
        <p className="text-ink-2 mt-3">
          It’s watching {markets.map(symbolOf).join(', ')} right now. The moment its rules line up it seals a call on Metis, and its record starts the day it makes one.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">
          <ActionButton href={`/agents/${slug}`} tone="black">
            Watch it work
          </ActionButton>
          <Share path={`/agents/${slug}`} text={`I just deployed ${name} on Called: an AI agent whose every call is sealed on Metis before the market moves.`} className="justify-center" />
        </div>
        <Link href="/agents" className="inline-block mt-6 text-sm font-semibold text-ink-3 hover:text-ink">
          See it on the board
        </Link>
      </motion.div>
    </div>
  )
}
