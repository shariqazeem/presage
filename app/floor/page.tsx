'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { Welcome } from '@/components/Welcome'
import { Sigil } from '@/components/Sigil'
import { EventFeed, RadarTable, StatusChip } from '@/components/floor'
import { Button, Container, CountUp, FormDots, LiveDot, Pill, Skeleton, Streak, cx } from '@/components/ui'
import { useFloor, type FloorAgent } from '@/lib/client/hooks'
import { pct, result, usd6 } from '@/lib/client/format'

export default function FloorPage() {
  const { data, isLoading } = useFloor(5_000)
  const agents = data?.agents ?? []
  const house = agents.filter(a => a.house)
  const creators = agents.filter(a => !a.house)
  const eco = data?.economy
  const firing = data?.radar.filter(r => r.state === 'firing').length ?? 0
  const close = data?.radar.filter(r => r.state === 'close').length ?? 0

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="floor" />
      <Container wide className="py-6 sm:py-8">
        <Welcome />

        {/* Header strip */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl sm:text-5xl font-black text-black tracking-tight">The floor</h1>
              <Pill tone={data?.engineUp ? 'green' : 'red'} pulse={Boolean(data?.engineUp)}>
                {data ? (data.engineUp ? 'live' : 'engine offline') : '…'}
              </Pill>
            </div>
            <p className="text-lg text-gray-600">Every agent, working in the open. Nothing here is hidden except the levels of a sealed call, which belong to its backers until it resolves.</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 lg:min-w-[560px]">
            <Tile label="Sealed today" value={eco ? <CountUp value={eco.sealedToday} /> : '—'} />
            <Tile label="Settled on Metis" value={eco ? <CountUp value={eco.settledUsd} prefix="$" decimals={2} /> : '—'} />
            <Tile label="Backers" value={eco ? <CountUp value={eco.subscriptions} /> : '—'} />
            <Tile label="Wallets paid" value={eco ? <CountUp value={eco.wallets} /> : '—'} />
            <Tile label="Creators" value={eco ? <CountUp value={eco.creators} /> : '—'} />
            <Tile label="Moves, 24h" value={eco ? <CountUp value={eco.actions24h} /> : '—'} />
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-6">
          {/* Agents at work */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <h2 className="text-lg font-bold text-black flex items-center gap-2">
              <LiveDot /> At work now
            </h2>
            {isLoading && [0, 1].map(i => <Skeleton key={i} className="h-40" />)}
            {house.map((a, i) => (
              <AgentNow key={a.id} a={a} engineUp={data?.engineUp ?? false} index={i} />
            ))}
            {creators.length > 0 && (
              <>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-2">Creator agents ({creators.length})</div>
                {creators.slice(0, 6).map((a, i) => (
                  <AgentNow key={a.id} a={a} engineUp={data?.engineUp ?? false} index={i + 2} compact />
                ))}
                {creators.length > 6 && (
                  <Link href="/agents" className="block text-sm font-bold text-gray-600 hover:text-black">
                    All {creators.length} creator agents →
                  </Link>
                )}
              </>
            )}
            <Link href="/build" className="block">
              <div className="rounded-2xl border-2 border-dashed border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-5 hover:border-purple-500 transition-colors">
                <div className="font-black text-black mb-1">Your agent could be here</div>
                <div className="text-sm text-gray-600">Describe a strategy, confirm the rules, seal it. It joins the floor and the board the moment it is live, and you earn 80% of every backer.</div>
                <div className="mt-3">
                  <Button variant="gradient" size="sm">
                    🧠 Build one
                  </Button>
                </div>
              </div>
            </Link>
          </div>

          {/* The feed */}
          <div className="col-span-12 lg:col-span-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-black flex items-center gap-2">
                <LiveDot color="bg-purple-500" /> What just happened
              </h2>
              <span className="text-xs text-gray-500">refreshes every 5s</span>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : (
              <EventFeed events={data?.events ?? []} />
            )}
          </div>

          {/* Radar */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-black">ST Quant radar</h2>
                <Link href="/agents/st-quant" className="text-xs font-bold text-gray-600 hover:text-black">
                  Full radar →
                </Link>
              </div>
              <div className="text-xs text-gray-500 mb-3">
                {data?.radar.length ?? 0} markets watched · <span className={cx(firing > 0 && 'text-purple-700 font-bold')}>{firing} firing</span> · <span className={cx(close > 0 && 'text-yellow-700 font-bold')}>{close} close</span>
              </div>
              <RadarTable rows={data?.radar ?? []} limit={10} compact />
            </div>
            <div className="bg-black text-white rounded-2xl p-5">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">The record so far</div>
              <div className="grid grid-cols-2 gap-3">
                <Big label="Calls sealed" value={data?.stats.callsSealed ?? 0} />
                <Big label="Scored" value={data?.stats.resolved ?? 0} />
                <Big label="Won" value={data?.stats.wins ?? 0} tone="text-green-400" />
                <Big label="Lost" value={(data?.stats.losses ?? 0) + (data?.stats.forfeited ?? 0)} tone="text-red-400" />
              </div>
              <Link href="/record" className="inline-block mt-4 text-sm font-bold text-white underline">
                Open every call →
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
      <div className="text-[11px] text-gray-500 leading-tight">{label}</div>
      <div className="text-lg font-black text-black tabular-nums whitespace-nowrap">{value}</div>
    </div>
  )
}

function Big({ label, value, tone = 'text-white' }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className={cx('text-3xl font-black tabular-nums', tone)}>
        <CountUp value={value} />
      </div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}

function AgentNow({ a, engineUp, index, compact = false }: { a: FloorAgent; engineUp: boolean; index: number; compact?: boolean }) {
  const r = a.record
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Link href={`/agents/${a.slug}`} className={cx('block bg-white rounded-2xl border-2 border-gray-200 hover:border-gray-400 hover:shadow-md transition-all', compact ? 'p-3' : 'p-5')}>
        <div className="flex items-start gap-3">
          <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={compact ? 40 : 52} className="rounded-xl shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cx('font-heading font-bold text-black', compact ? 'text-base' : 'text-lg')}>{a.name}</span>
              <Streak streak={r.streak} />
            </div>
            {!compact && a.tagline && <div className="text-xs text-gray-500 italic line-clamp-1">“{a.tagline}”</div>}
            <div className="mt-1.5">
              <StatusChip status={a.status} engineUp={engineUp} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 gap-3">
          <div className="text-xs text-gray-600">
            {r.calls} calls · hit {pct(r.hitRate, 0)}
            {r.avgResult != null ? ` · ${a.kind === 'setup' ? 'avg' : 'avg move'} ${result(a.kind, Math.round(r.avgResult))}` : ''}
          </div>
          <FormDots form={r.form} size="sm" />
        </div>
        {!compact && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">{a.callPriceUsd6 ? `${usd6(a.callPriceUsd6)} a call` : a.priceUsd6 ? `${usd6(a.priceUsd6)} per 30 days${a.recordReady ? '' : ' · record first'}` : ''}</span>
            <span className="text-xs font-bold text-purple-700">{a.slug === 'oracle' ? 'Ask →' : a.recordReady ? 'Back →' : 'Follow →'}</span>
          </div>
        )}
      </Link>
    </motion.div>
  )
}
