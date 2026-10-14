'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { WalletButton } from '@/components/WalletButton'
import { AgentCard, LiveCallsFeed, RecordBar, StatCard, agentEmoji } from '@/components/agents'
import { AgentCardSkeleton } from '@/components/Skeletons'
import { useAgents, useFeed, useStats } from '@/lib/client/hooks'
import { RECORD_BAR } from '@/lib/records'
import { pct, result } from '@/lib/client/format'

type Tab = 'leaderboard' | 'mine'

export default function AgentsPage() {
  const { address } = useAccount()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const { data, isLoading } = useAgents()
  const { data: feed } = useFeed()
  const { data: stats } = useStats()
  const agents = data?.agents ?? []

  const mine = useMemo(() => agents.filter(a => address && a.creator.toLowerCase() === address.toLowerCase()), [agents, address])
  // Ranked by what they have proven: agents with a full record first, then by hit rate, then by calls.
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

      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <StatCard label="Agents" value={agents.length} icon="🤖" color={agents.length ? 'success' : 'default'} />
            <StatCard label="Calls sealed" value={stats?.callsSealed ?? '—'} icon="🔒" />
            <StatCard label="Scored" value={stats?.resolved ?? '—'} icon="📏" />
            <StatCard label="Hit rate, all agents" value={pct(overallHit)} icon="✓" color="success" />
            <StatCard label="Forfeited" value={stats?.forfeited ?? '—'} icon="🚫" color={stats?.forfeited ? 'error' : 'default'} />
          </div>

          <motion.div className="bg-white p-4 rounded-xl border-2 border-green-200 shadow-sm" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-4 flex-1">
                <div className="text-3xl">🔒</div>
                <div>
                  <div className="font-bold text-black mb-1 text-lg">Every call here was sealed on Metis before its outcome</div>
                  <div className="text-xs text-gray-600">
                    Calls are scored by price and revealed on chain. A call that is not revealed in time can be forfeited by anyone and counts as a loss. An
                    agent can only take subscribers after {RECORD_BAR.calls} scored calls over {RECORD_BAR.days} days.
                  </div>
                </div>
              </div>
              <Link href="/record">
                <button className="border-2 border-gray-200 px-4 py-2 rounded-lg text-sm font-bold text-black hover:border-black hover:bg-gray-50 transition-all whitespace-nowrap">
                  Check the record →
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-6 py-8 pt-4">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl flex-1">
                <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>
                  🏆 Leaderboard ({agents.length})
                </TabButton>
                <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
                  💼 My agents ({mine.length})
                </TabButton>
                <Link href="/build" className="flex-1">
                  <button className="w-full px-6 py-3 rounded-lg font-bold text-gray-600 hover:text-black transition-all">🧠 Build</button>
                </Link>
              </div>
              <Link href="/build" className="hidden md:block">
                <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl whitespace-nowrap">
                  ✨ Deploy Agent
                </button>
              </Link>
            </div>

            {isLoading && (
              <div className="space-y-4">
                {[0, 1, 2].map(i => (
                  <AgentCardSkeleton key={i} index={i} />
                ))}
              </div>
            )}

            {tab === 'leaderboard' && !isLoading && (
              <div className="space-y-4">
                {ranked.length === 0 && (
                  <EmptyState
                    emoji="🌱"
                    title="The first agents are being registered"
                    body="The Oracle and ST Quant start their public records on day one. Check back in a few minutes, or build your own."
                  />
                )}
                {ranked.map((a, i) => (
                  <AgentCard key={a.id} a={a} index={i} latest={latestFor(a.id)} />
                ))}
              </div>
            )}

            {tab === 'mine' && !isLoading && (
              <div className="space-y-4">
                {!address && (
                  <div className="bg-white p-4 rounded-xl border-2 border-blue-200 shadow-sm flex items-center gap-3">
                    <div className="text-2xl">👛</div>
                    <div className="flex-1">
                      <div className="font-semibold text-black mb-1">Connect the wallet you build with</div>
                      <div className="text-sm text-gray-600">Your agents and your earnings live under your wallet address.</div>
                    </div>
                    <WalletButton compact />
                  </div>
                )}
                {address && mine.length === 0 && (
                  <EmptyState
                    emoji="🚀"
                    title="Deploy your first agent"
                    body="Write your strategy in plain English. Presage turns it into rules you confirm, runs it, and seals every call it makes. You earn 80% of every subscription once it has a record."
                    action={{ href: '/build', label: '🧠 Build an agent' }}
                  />
                )}
                {mine.map((a, i) => (
                  <AgentCard key={a.id} a={a} index={i} latest={latestFor(a.id)} />
                ))}
                {address && mine.length > 0 && (
                  <Link href={`/creators/${address}`}>
                    <button className="w-full bg-black text-white px-4 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-all">💰 Earnings and claims →</button>
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <LiveCallsFeed calls={feed?.calls ?? []} />
            {ranked.length > 0 && (
              <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-black">🏆 Records at a glance</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {ranked.slice(0, 6).map((a, i) => (
                    <Link key={a.id} href={`/agents/${a.slug}`} className="block p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-gray-400">#{i + 1}</span>
                          <span className="text-lg">{agentEmoji(a)}</span>
                          <span className="font-bold text-black text-sm">{a.name}</span>
                        </div>
                        <div className="text-right text-xs">
                          <div className="font-bold text-green-600">{pct(a.record.hitRate, 0)}</div>
                          <div className="text-gray-500">{a.record.avgResult == null ? '—' : result(a.kind, Math.round(a.record.avgResult))}</div>
                        </div>
                      </div>
                      <RecordBar r={a.record} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 px-6 py-3 rounded-lg font-bold transition-all ${active ? 'bg-white text-black shadow-md' : 'text-gray-600 hover:text-black'}`}>
      {children}
    </button>
  )
}

function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-blue-50 to-purple-50 p-8 rounded-xl border-2 border-blue-200 shadow-lg text-center">
      <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ duration: 0.5, type: 'spring' }} className="text-7xl mb-4">
        {emoji}
      </motion.div>
      <h3 className="text-2xl font-bold text-black mb-3">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-xl mx-auto">{body}</p>
      {action && (
        <Link href={action.href}>
          <button className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-6 py-3 rounded-lg font-bold hover:from-purple-600 hover:to-blue-600 transition-all shadow-md hover:shadow-lg">
            {action.label}
          </button>
        </Link>
      )}
    </motion.div>
  )
}
