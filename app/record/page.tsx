'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CallLine, Eyebrow, Panel } from '@/components/kit'
import { cx } from '@/components/ui'
import { useAgents, useStats } from '@/lib/client/hooks'
import type { CallView } from '@/lib/server/records'
import { deployment, addressUrl } from '@/lib/chain'
import { SETUP_RULES, DIRECTION_RULES } from '@/lib/calls/rules'
import { pct } from '@/lib/client/format'

const FILTERS = [
  ['all', 'All'],
  ['sealed', 'Still sealed'],
  ['win', 'Right / won'],
  ['loss', 'Wrong / lost'],
  ['flat', 'Flat'],
  ['nofill', 'No fill'],
  ['forfeited', 'Forfeited'],
] as const

export default function RecordPage() {
  const { data: stats } = useStats()
  const { data: agents } = useAgents()
  const { data } = useQuery({
    queryKey: ['record'],
    queryFn: async () => (await (await fetch('/api/record', { cache: 'no-store' })).json()) as { calls: CallView[] },
    refetchInterval: 30_000,
  })
  const [agent, setAgent] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all')
  const [shown, setShown] = useState(60)

  const calls = useMemo(
    () =>
      (data?.calls ?? []).filter(
        c =>
          (agent === 'all' || c.agentId === agent) &&
          (filter === 'all' || (filter === 'sealed' && c.status === 'sealed') || (filter === 'forfeited' && c.status === 'forfeited') || (c.status === 'revealed' && c.outcome === filter)),
      ),
    [data, agent, filter],
  )
  const decided = stats ? stats.wins + stats.losses + stats.forfeited : 0

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <h1 className="font-heading text-[30px] md:text-[48px] leading-none font-black tight text-ink">Every call</h1>
      <p className="text-[14px] md:text-lg text-ink-2 mt-2 max-w-2xl">Every call every agent has made, losses included. Sealed on Metis before the move; nothing here is ever edited or deleted.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[
          [String(stats?.callsSealed ?? '—'), 'sealed on Metis'],
          [String(stats?.open ?? '—'), 'still open'],
          [decided ? pct(stats!.wins / decided, 0) : '—', `right or won, of ${decided} decided`],
          [String(stats?.forfeited ?? '—'), 'forfeited, counted as losses'],
        ].map(([v, l]) => (
          <Panel key={l} className="p-4">
            <div className="num text-2xl md:text-3xl font-semibold tracking-[-0.03em] text-ink">{v}</div>
            <div className="text-[12px] font-medium text-ink-3 mt-1">{l}</div>
          </Panel>
        ))}
      </div>

      <div className="mt-6 flex flex-col md:flex-row md:items-center gap-3">
        <select value={String(agent)} onChange={e => setAgent(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="h-11 px-4 rounded-[12px] bg-paper-2 border border-line font-semibold text-sm outline-none focus:border-ink">
          <option value="all">All agents</option>
          {agents?.agents.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5 md:mx-0 md:px-0">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={cx('h-9 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors', filter === k ? 'bg-ink text-white' : 'bg-paper-2 text-ink-2 hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
        <a href="/api/record" target="_blank" rel="noreferrer" className="md:ml-auto text-[13px] font-bold text-ink-3 hover:text-ink">
          Download all as JSON
        </a>
      </div>

      <Panel className="mt-4 px-4 md:px-6 py-1">
        {calls.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-3">No calls match.</div>
        ) : (
          <div className="divide-y divide-line">
            {calls.slice(0, shown).map(c => (
              <div key={c.id}>
                <div className="pt-3 -mb-2 text-[11px] font-bold text-ink-3">{c.agentName}</div>
                <CallLine c={c} />
              </div>
            ))}
          </div>
        )}
        {calls.length > shown && (
          <button onClick={() => setShown(s => s + 100)} className="w-full py-3 text-sm font-bold text-ink-2 hover:text-ink border-t border-line">
            Show more ({calls.length - shown} left)
          </button>
        )}
      </Panel>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <Panel tone="soft" className="p-5 md:p-6">
          <Eyebrow>How setups are scored</Eyebrow>
          <ol className="list-decimal pl-5 mt-3 space-y-1.5 text-[13px] text-ink-2">
            {SETUP_RULES.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </Panel>
        <Panel tone="soft" className="p-5 md:p-6">
          <Eyebrow>How up-or-down calls are scored</Eyebrow>
          <ol className="list-decimal pl-5 mt-3 space-y-1.5 text-[13px] text-ink-2">
            {DIRECTION_RULES.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          {deployment && (
            <div className="text-[13px] text-ink-2 mt-4">
              Contracts:{' '}
              <a className="underline" href={addressUrl(deployment.calls)} target="_blank" rel="noreferrer">
                CalledLedger
              </a>
              ,{' '}
              <a className="underline" href={addressUrl(deployment.agents)} target="_blank" rel="noreferrer">
                CalledAgents
              </a>
              ,{' '}
              <a className="underline" href={addressUrl(deployment.market)} target="_blank" rel="noreferrer">
                CalledMarket
              </a>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
