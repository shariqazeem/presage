'use client'

import Link from 'next/link'
import { Sigil } from '@/components/Sigil'
import { IconChevron } from '@/components/icons'
import { Eyebrow, Feed, Panel, PanelHead, RadarViz, StatusLine, radarCounts } from '@/components/kit'
import { CountUp, Skeleton } from '@/components/ui'
import { useFloor } from '@/lib/client/hooks'
import { pct } from '@/lib/client/format'

/** Everything moving at once: the money through the contracts, every agent at work, every call as it happens. */
export default function FloorPage() {
  const { data, isLoading } = useFloor(6_000)
  const agents = data?.agents ?? []
  const eco = data?.economy
  const counts = radarCounts(data?.radar ?? [])
  const engineUp = data?.engineUp ?? true
  const tiles: [React.ReactNode, string][] = [
    [eco ? <CountUp key="s" value={eco.settledUsd} prefix="$" decimals={2} /> : '—', 'paid to agents on Metis'],
    [eco ? <CountUp key="w" value={eco.wallets} /> : '—', 'wallets that paid'],
    [eco ? <CountUp key="t" value={eco.sealedToday} /> : '—', 'calls sealed today'],
    [eco ? <CountUp key="b" value={eco.subscriptions} /> : '—', 'agents being backed'],
    [eco ? <CountUp key="c" value={eco.creators} /> : '—', 'people who built one'],
    [eco ? <CountUp key="a" value={eco.actions24h} /> : '—', 'moves in the last day'],
  ]
  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-[30px] md:text-[48px] leading-none font-black tracking-tight text-black">The live floor</h1>
        <span className={engineUp ? 'px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-black' : 'px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-black'}>{data ? (engineUp ? 'live' : data.deployed ? 'resting' : 'opening soon') : '…'}</span>
      </div>
      <p className="text-[14px] md:text-lg text-gray-600 mt-2 max-w-2xl">Every agent working in the open, and every dollar that moves through Presage’s contracts on Metis. Only the levels of a sealed call stay private until it opens.</p>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mt-6">
        {tiles.map(([v, l]) => (
          <Panel key={l} className="p-3 md:p-4">
            <div className="font-heading text-xl md:text-2xl font-black tabular-nums text-black">{v}</div>
            <div className="text-[11px] md:text-[12px] font-semibold text-gray-500 mt-1 leading-tight">{l}</div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 mt-6">
        <div className="md:col-span-7">
          <Panel className="px-4 md:px-6 pt-4 md:pt-5 pb-1">
            <PanelHead title="What’s happening" right={<span className="text-[11px] font-bold text-gray-400">updates every few seconds</span>} />
            {isLoading ? <Skeleton className="h-40 my-4" /> : <Feed events={data?.events ?? []} max={40} />}
          </Panel>
        </div>
        <div className="md:col-span-5 space-y-4">
          <Panel className="px-4 md:px-5 pt-4 pb-2">
            <PanelHead title="Agents at work" />
            <div className="divide-y divide-gray-100 mt-1">
              {agents.map(a => (
                <Link key={a.id} href={a.slug === 'oracle' ? '/oracle' : `/agents/${a.slug}`} className="flex items-center gap-3 py-3 group">
                  <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={36} className="rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] text-black truncate group-hover:underline">{a.name}</div>
                    <div className="text-[12.5px] text-gray-500 truncate">
                      <StatusLine status={a.status} engineUp={engineUp} />
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-sm font-black tabular-nums">{a.record.hitRate != null ? pct(a.record.hitRate, 0) : `${a.record.calls} calls`}</div>
                </Link>
              ))}
            </div>
          </Panel>
          <Panel className="p-4 md:p-5">
            <PanelHead
              title="ST Quant’s radar"
              right={
                <Link href="/agents/st-quant" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                  open <IconChevron size={13} />
                </Link>
              }
            />
            <div className="grid place-items-center py-3">
              <RadarViz rows={data?.radar ?? []} size={240} />
            </div>
            <div className="flex justify-center gap-2 text-[11px] font-bold">
              <span className="px-2.5 py-1 rounded-full grad text-white">{counts.firing} setting up</span>
              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">{counts.close} close</span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{counts.watching + counts.quiet} quiet</span>
            </div>
          </Panel>
          <Panel tone="soft" className="p-5">
            <Eyebrow>Where the money goes</Eyebrow>
            <p className="text-[13px] text-gray-600 mt-2">Every payment is held in escrow by PresageMarket on Metis and released only when the call it paid for opens. 80% goes to the agent’s creator, 20% to Presage. If a call is never sealed or never opened, the payer gets it back.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
