'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { WalletButton } from '@/components/WalletButton'
import { Welcome } from '@/components/Welcome'
import { Sigil } from '@/components/Sigil'
import { AgentCard, LiveCallsFeed, RecordBar } from '@/components/agents'
import { Button, Container, Empty, FormDots, Pill, Skeleton, Stat, cx } from '@/components/ui'
import { useFeed, useFloor } from '@/lib/client/hooks'
import { RECORD_BAR } from '@/lib/records'
import { pct, result } from '@/lib/client/format'

type Tab = 'board' | 'mine'

export default function AgentsPage() {
  const { address } = useAccount()
  const [tab, setTab] = useState<Tab>('board')
  const { data: floor, isLoading } = useFloor(10_000)
  const { data: feed } = useFeed()
  const agents = floor?.agents ?? []
  const stats = floor?.stats

  const mine = useMemo(() => agents.filter(a => address && a.creator.toLowerCase() === address.toLowerCase()), [agents, address])
  // Ranked by what they have proven: a full record first, then hit rate, then how much they have called.
  const ranked = useMemo(
    () =>
      [...agents].sort(
        (x, y) =>
          Number(y.record.resolved >= RECORD_BAR.calls) - Number(x.record.resolved >= RECORD_BAR.calls) ||
          (y.record.hitRate ?? -1) - (x.record.hitRate ?? -1) ||
          y.record.resolved - x.record.resolved,
      ),
    [agents],
  )
  const latestFor = (id: number) => feed?.calls.find(c => c.agentId === id)
  const overallHit = stats && stats.wins + stats.losses + stats.forfeited > 0 ? stats.wins / (stats.wins + stats.losses + stats.forfeited) : null

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="agents" />
      <Container wide className="py-6 sm:py-8">
        <Welcome />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black text-black tracking-tight mb-1">The board</h1>
            <p className="text-lg text-gray-600">Agents ranked by what they have proven. A hidden call counts as a loss. Nothing is ever deleted.</p>
          </div>
          <Button href="/build" variant="gradient">
            ✨ Deploy an agent
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat size="sm" icon="🤖" value={agents.length} label="Agents" tone={agents.length ? 'green' : 'default'} />
          <Stat size="sm" icon="🔒" value={stats?.callsSealed ?? '—'} label="Calls sealed" delay={0.05} />
          <Stat size="sm" icon="📏" value={stats?.resolved ?? '—'} label="Scored" delay={0.1} />
          <Stat size="sm" icon="🎯" value={pct(overallHit)} label="Hit rate, all agents" delay={0.15} />
          <Stat size="sm" icon="🚫" value={stats?.forfeited ?? '—'} label="Forfeited" tone={stats?.forfeited ? 'red' : 'default'} delay={0.2} />
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
              <TabButton active={tab === 'board'} onClick={() => setTab('board')}>
                🏆 Leaderboard ({agents.length})
              </TabButton>
              <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
                💼 My agents ({mine.length})
              </TabButton>
            </div>

            {isLoading && (
              <div className="space-y-4">
                {[0, 1, 2].map(i => (
                  <Skeleton key={i} className="h-72" />
                ))}
              </div>
            )}

            {tab === 'board' && !isLoading && (
              <div className="space-y-4">
                {ranked.length === 0 && <Empty emoji="🌱" title="The first agents are being registered" body="The Oracle and ST Quant start their public records on day one. Check back in a few minutes, or build your own." />}
                {ranked.map((a, i) => (
                  <AgentCard key={a.id} a={a} index={i} rank={i + 1} latest={latestFor(a.id)} engineUp={floor?.engineUp ?? false} />
                ))}
              </div>
            )}

            {tab === 'mine' && !isLoading && (
              <div className="space-y-4">
                {!address && (
                  <div className="bg-white p-4 rounded-2xl border-2 border-blue-200 shadow-sm flex items-center gap-3">
                    <div className="text-2xl">👛</div>
                    <div className="flex-1">
                      <div className="font-semibold text-black mb-1">Connect the wallet you build with</div>
                      <div className="text-sm text-gray-600">Your agents and your earnings live under your wallet address.</div>
                    </div>
                    <WalletButton compact />
                  </div>
                )}
                {address && mine.length === 0 && (
                  <Empty
                    emoji="🚀"
                    title="Deploy your first agent"
                    body="Write your strategy in plain English. Presage turns it into rules you confirm, runs it, and seals every call it makes. You earn 80% of every backer once it has a record."
                    action={
                      <Button href="/build" variant="gradient">
                        🧠 Build an agent
                      </Button>
                    }
                  />
                )}
                {mine.map((a, i) => (
                  <AgentCard key={a.id} a={a} index={i} latest={latestFor(a.id)} engineUp={floor?.engineUp ?? false} />
                ))}
                {address && mine.length > 0 && (
                  <Button href={`/creators/${address}`} full>
                    💰 Earnings and claims →
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <LiveCallsFeed calls={feed?.calls ?? []} />
            {ranked.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-black">🏆 At a glance</h3>
                  <Pill tone="gray">form, last 10</Pill>
                </div>
                <div className="divide-y divide-gray-100">
                  {ranked.slice(0, 8).map((a, i) => (
                    <Link key={a.id} href={`/agents/${a.slug}`} className="block p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-black text-gray-400 w-5">#{i + 1}</span>
                          <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={28} className="rounded-lg" />
                          <span className="font-bold text-black text-sm truncate">{a.name}</span>
                        </div>
                        <div className="text-right text-xs shrink-0">
                          <div className={cx('font-bold', (a.record.hitRate ?? 0) >= 0.5 ? 'text-green-600' : 'text-gray-700')}>{pct(a.record.hitRate, 0)}</div>
                          <div className="text-gray-500">{a.record.avgResult == null ? '—' : result(a.kind, Math.round(a.record.avgResult))}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <RecordBar r={a.record} height="h-2" />
                        </div>
                        <FormDots form={a.record.form} size="sm" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Container>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('flex-1 px-6 py-3 rounded-lg font-bold transition-all', active ? 'bg-white text-black shadow-md' : 'text-gray-600 hover:text-black')}>
      {children}
    </button>
  )
}
