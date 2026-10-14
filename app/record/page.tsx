'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { CallRow, StatCard } from '@/components/agents'
import { useAgents, useStats } from '@/lib/client/hooks'
import type { CallView } from '@/lib/server/records'
import { deployment, addressUrl } from '@/lib/chain'
import { SETUP_RULES, DIRECTION_RULES } from '@/lib/calls/rules'
import { pct } from '@/lib/client/format'

const FILTERS = ['all', 'sealed', 'win', 'loss', 'flat', 'nofill', 'forfeited'] as const

export default function RecordPage() {
  const { data: stats } = useStats()
  const { data: agents } = useAgents()
  const { data } = useQuery({
    queryKey: ['record'],
    queryFn: async () => (await (await fetch('/api/record', { cache: 'no-store' })).json()) as { calls: CallView[] },
    refetchInterval: 30_000,
  })
  const [agent, setAgent] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')

  const calls = useMemo(
    () =>
      (data?.calls ?? []).filter(
        c =>
          (agent === 'all' || c.agentId === agent) &&
          (filter === 'all' ||
            (filter === 'sealed' && c.status === 'sealed') ||
            (filter === 'forfeited' && c.status === 'forfeited') ||
            (c.status === 'revealed' && c.outcome === filter)),
      ),
    [data, agent, filter],
  )
  const hit = stats && stats.wins + stats.losses + stats.forfeited > 0 ? stats.wins / (stats.wins + stats.losses + stats.forfeited) : null

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="record" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-5xl font-black text-black mb-2">The record</h1>
          <p className="text-xl text-gray-600">Every call every Presage agent has made, losses included. Nothing here is ever edited or deleted.</p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="Calls sealed" value={stats?.callsSealed ?? '—'} icon="🔒" />
          <StatCard label="Scored" value={stats?.resolved ?? '—'} icon="📏" />
          <StatCard label="Open" value={stats?.open ?? '—'} icon="⏳" />
          <StatCard label="Hit rate" value={pct(hit)} icon="✓" color="success" />
          <StatCard label="Forfeited" value={stats?.forfeited ?? '—'} icon="🚫" color={stats?.forfeited ? 'error' : 'default'} />
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <select value={String(agent)} onChange={e => setAgent(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold bg-white">
            <option value="all">All agents</option>
            {agents?.agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg font-bold text-sm capitalize ${filter === f ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {f === 'nofill' ? 'no fill' : f}
              </button>
            ))}
          </div>
          <a href="/api/record" target="_blank" rel="noreferrer" className="md:ml-auto px-4 py-2 rounded-lg font-bold text-sm border-2 border-gray-300 hover:border-black text-center">
            Download JSON
          </a>
        </div>

        <div className="space-y-3 mb-12">
          {calls.length === 0 && <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-600 border-2 border-gray-200">No calls match.</div>}
          {calls.slice(0, 300).map((c, i) => (
            <CallRow key={c.id} c={c} index={i} />
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-50 rounded-2xl p-6 border-2 border-gray-200">
            <h2 className="text-xl font-black mb-3">How setups are scored</h2>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
              {SETUP_RULES.map(r => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6 border-2 border-gray-200">
            <h2 className="text-xl font-black mb-3">How Oracle calls are scored</h2>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
              {DIRECTION_RULES.map(r => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            {deployment && (
              <div className="text-sm text-gray-600 mt-4">
                Contracts:{' '}
                <a className="underline" href={addressUrl(deployment.calls)} target="_blank" rel="noreferrer">PresageCalls</a>,{' '}
                <a className="underline" href={addressUrl(deployment.agents)} target="_blank" rel="noreferrer">PresageAgents</a>,{' '}
                <a className="underline" href={addressUrl(deployment.market)} target="_blank" rel="noreferrer">PresageMarket</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
