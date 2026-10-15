'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { CallView } from '@/lib/server/records'
import { RECORD_BAR, type AgentSummary } from '@/lib/records'
import { addressUrl, erc8004, isMainnet, txUrl } from '@/lib/chain'
import { ago, OUTCOME_STYLE, pct, price, result, short, until, usd6 } from '@/lib/client/format'

export const agentEmoji = (a: Pick<AgentSummary, 'slug' | 'kind' | 'house'>) =>
  a.slug === 'oracle' ? '🔮' : a.slug === 'st-quant' ? '📐' : a.kind === 'direction' ? '🧭' : '🤖'

export function StatCard({ label, value, icon, color = 'default' }: { label: string; value: string | number; icon: string; color?: 'default' | 'success' | 'error' }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <div className={`text-lg font-black ${color === 'success' ? 'text-green-600' : color === 'error' ? 'text-red-600' : 'text-black'}`}>{value}</div>
    </div>
  )
}

/** Wins, losses, flats, no-fills and forfeits as one bar. Losses are drawn as loudly as wins. */
export function RecordBar({ r }: { r: AgentSummary['record'] }) {
  const total = r.wins + r.losses + r.flats + r.noFills + r.forfeited
  if (!total) return <div className="h-3 rounded-full bg-gray-100" />
  const seg = (n: number, cls: string, title: string) =>
    n > 0 ? <div className={cls} style={{ width: `${(n / total) * 100}%` }} title={`${title}: ${n}`} /> : null
  return (
    <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
      {seg(r.wins, 'bg-green-500', 'Wins')}
      {seg(r.losses, 'bg-red-500', 'Losses')}
      {seg(r.forfeited, 'bg-red-800', 'Forfeited')}
      {seg(r.flats, 'bg-gray-400', 'Flat')}
      {seg(r.noFills, 'bg-gray-300', 'No fill')}
    </div>
  )
}

export function RecordProgress({ a }: { a: AgentSummary }) {
  if (a.recordReady || a.priceUsd6 === 0) return null
  const days = a.record.firstCallAt ? Math.floor((Date.now() / 1000 - a.record.firstCallAt) / 86_400) : 0
  const callsPct = Math.min(1, a.record.resolved / RECORD_BAR.calls)
  const daysPct = Math.min(1, days / RECORD_BAR.days)
  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border-2 border-purple-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-purple-700">⏳ Building its record</span>
        <span className="px-2 py-1 bg-purple-600 text-white text-xs font-bold rounded">NOT FOR SALE YET</span>
      </div>
      <div className="text-xs text-gray-700 mb-2">
        Subscriptions open on chain after {RECORD_BAR.calls} scored calls over {RECORD_BAR.days} days. Nobody can sell an empty record, including us.
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="flex justify-between mb-1">
            <span>Scored calls</span>
            <span className="font-bold">
              {a.record.resolved}/{RECORD_BAR.calls}
            </span>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div className="h-full bg-purple-600" style={{ width: `${callsPct * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span>Days</span>
            <span className="font-bold">
              {days}/{RECORD_BAR.days}
            </span>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: `${daysPct * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentCard({ a, index = 0, latest }: { a: AgentSummary; index?: number; latest?: CallView }) {
  const r = a.record
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all overflow-hidden"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-black flex items-center justify-center text-3xl shadow-lg">{agentEmoji(a)}</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-heading font-bold text-black">{a.name}</h3>
                {a.house && <span className="px-2 py-0.5 bg-black text-white text-xs font-bold rounded">HOUSE</span>}
                {a.retired && <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-bold rounded">RETIRED</span>}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ERC-8004 #{a.id} • {a.kind === 'direction' ? 'direction calls' : 'trade setups'} • by {a.house ? 'Presage' : short(a.creator)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">{a.callPriceUsd6 ? 'per call' : a.priceUsd6 ? 'per 30 days' : ''}</div>
            <div className="text-xl font-black text-black">{a.callPriceUsd6 ? usd6(a.callPriceUsd6) : a.priceUsd6 ? usd6(a.priceUsd6) : 'Free'}</div>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{a.description}</p>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <Metric label="Calls" value={String(r.calls)} />
          <Metric label="Hit rate" value={pct(r.hitRate, 0)} color="text-green-600" />
          <Metric label={a.kind === 'setup' ? 'Avg R' : 'Avg move'} value={r.avgResult == null ? '—' : result(a.kind, Math.round(r.avgResult))} color={(r.avgResult ?? 0) < 0 ? 'text-red-600' : 'text-blue-600'} />
          <Metric label="Losses" value={String(r.losses + r.forfeited)} color="text-red-600" />
        </div>

        <div className="mb-4">
          <RecordBar r={r} />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>
              {r.wins}W · {r.losses}L · {r.flats} flat · {r.noFills} no fill · {r.forfeited} forfeited
            </span>
            <span>{r.open} open</span>
          </div>
        </div>

        {latest && (
          <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Latest call</span>
              <span className="text-xs text-gray-500">{ago(latest.sealedAt ?? latest.issuedAt)}</span>
            </div>
            <CallSummary c={latest} />
          </div>
        )}

        <RecordProgress a={a} />

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Link href={`/agents/${a.slug}`}>
            <button className="w-full bg-black text-white px-4 py-3 rounded-lg font-semibold transition-all hover:bg-gray-800">📜 Record</button>
          </Link>
          <Link href={a.slug === 'oracle' ? '/oracle' : `/agents/${a.slug}#subscribe`}>
            <button className="w-full border-2 border-purple-200 px-4 py-3 rounded-lg font-semibold transition-all hover:border-purple-400 hover:bg-purple-50 text-purple-700">
              {a.slug === 'oracle' ? '🔮 Ask' : a.recordReady ? '🔔 Subscribe' : '👀 Follow'}
            </button>
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

function Metric({ label, value, color = 'text-black' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 p-2 rounded-lg text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

/** One line describing a call: sealed calls show only that they exist, revealed calls show everything. */
export function CallSummary({ c }: { c: CallView }) {
  if (c.hidden || !c.payload) {
    return (
      <div className="text-sm text-gray-800">
        🔒 Sealed call #{c.chainCallId} · revealed within {until(c.revealBy)}
      </div>
    )
  }
  const p = c.payload
  if (p.rules === 'presage/direction-v1') {
    return (
      <div className="text-sm text-gray-800">
        <b>{p.asset.symbol}</b> {p.direction === 'up' ? '📈 up' : '📉 down'} over {p.horizonSec / 3600}h from ${price(p.priceAtIssue)} • {p.confidence}%
      </div>
    )
  }
  return (
    <div className="text-sm text-gray-800">
      <b>{p.asset.symbol}</b> long • entry {price(p.entry.price)} • stop {price(p.stop)} • target {price(p.target)}
    </div>
  )
}

export function OutcomeBadge({ c }: { c: Pick<CallView, 'status' | 'outcome'> }) {
  const key = c.status === 'forfeited' ? 'forfeited' : c.status === 'sealed' ? 'sealed' : c.outcome ?? 'sealed'
  const s = OUTCOME_STYLE[key]
  return <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

export function CallRow({ c, index = 0, showAgent = true }: { c: CallView; index?: number; showAgent?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <Link href={`/calls/${c.id}`} className="block bg-white rounded-xl p-4 border-2 border-gray-200 shadow-sm hover:shadow-lg hover:border-gray-300 transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {showAgent && <div className="text-xs font-bold text-gray-500 mb-1">{c.agentName}</div>}
            <CallSummary c={c} />
            <div className="text-xs text-gray-500 mt-1">
              Sealed {ago(c.sealedAt)} • call #{c.chainCallId}
              {c.revealedAt ? ` • revealed ${ago(c.revealedAt)}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {c.result != null && <span className="text-sm font-bold text-black">{result(c.kind, c.result)}</span>}
            <OutcomeBadge c={c} />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function LiveCallsFeed({ calls }: { calls: CallView[] }) {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-black flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live on Metis
        </h3>
        <Link href="/record" className="text-xs font-bold text-gray-600 hover:text-black">
          All calls →
        </Link>
      </div>
      <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-100">
        {calls.length === 0 && <div className="p-6 text-sm text-gray-500 text-center">No calls sealed yet.</div>}
        {calls.map(c => (
          <Link key={c.id} href={`/calls/${c.id}`} className="block p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-gray-700">{c.agentName}</span>
              <OutcomeBadge c={c} />
            </div>
            <CallSummary c={c} />
            <div className="text-xs text-gray-400 mt-1 font-mono">{c.sealTx ? `${c.sealTx.slice(0, 14)}…` : ''} • {ago(c.revealedAt ?? c.sealedAt)}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function IdentityCard({ a }: { a: AgentSummary }) {
  const scan = `https://www.8004scan.io/agents/${isMainnet ? 'metis' : 'metis-sepolia'}/${a.id}`
  return (
    <motion.div whileHover={{ scale: 1.01 }} className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">ERC-8004 identity</div>
          <div className="text-3xl font-black text-black">#{a.id}</div>
        </div>
        <div className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold">
          {a.recordReady ? 'Record open' : 'Building record'}
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <Row k="Registry" v={<a className="font-mono underline" href={addressUrl(erc8004.identity)} target="_blank" rel="noreferrer">{short(erc8004.identity)}</a>} />
        <Row k="Creator" v={<Link className="font-mono underline" href={`/creators/${a.creator}`}>{short(a.creator)}</Link>} />
        <Row k="Spec hash" v={<a className="font-mono underline" href={`/api/specs/${a.specHash}`} target="_blank" rel="noreferrer">{short(a.specHash, 6)}</a>} />
        {a.registeredTx && <Row k="Registered" v={<a className="font-mono underline" href={txUrl(a.registeredTx)} target="_blank" rel="noreferrer">{short(a.registeredTx, 6)}</a>} />}
        <Row k="Agent card" v={<a className="underline" href={`/api/agents/${a.slug}/card`} target="_blank" rel="noreferrer">registration file</a>} />
        <Row k="Explorer" v={<a className="underline" href={scan} target="_blank" rel="noreferrer">8004scan</a>} />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600">
        The spec is sealed by its hash. Changing a strategy means registering a new agent, so this record only ever belongs to this one.
      </div>
    </motion.div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{k}</span>
      <span className="text-black">{v}</span>
    </div>
  )
}
