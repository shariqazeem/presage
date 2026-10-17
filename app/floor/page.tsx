'use client'

import Link from 'next/link'
import { Sigil } from '@/components/Sigil'
import { IconChevron } from '@/components/icons'
import { Eyebrow, Feed, Panel, PanelHead, RadarViz, StatusLine, Tag, radarCounts } from '@/components/kit'
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
        <h1 className="font-heading text-[30px] md:text-[48px] leading-none font-black tight text-ink">The live floor</h1>
        <Tag tone={engineUp && data?.deployed ? 'foil' : 'soft'}>{data ? (engineUp && data.deployed ? 'live' : data.deployed ? 'resting' : 'opening soon') : '…'}</Tag>
      </div>
      <p className="text-[14px] md:text-lg text-ink-2 mt-2 max-w-2xl">Every agent working in the open, and every dollar that moves through the Called contracts on Metis. Only the levels of a sealed call stay private until it opens.</p>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mt-6">
        {tiles.map(([v, l]) => (
          <Panel key={l} className="p-3 md:p-4">
            <div className="num text-xl md:text-2xl font-semibold tracking-[-0.03em] text-ink">{v}</div>
            <div className="text-[11px] md:text-[12px] font-medium text-ink-3 mt-1 leading-tight">{l}</div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 mt-6">
        <div className="md:col-span-7">
          <Panel className="px-4 md:px-6 pt-4 md:pt-5 pb-1">
            <PanelHead title="What’s happening" right={<span className="label !text-[9.5px] text-ink-3">live</span>} />
            {isLoading ? <Skeleton className="h-40 my-4" /> : <Feed events={data?.events ?? []} max={40} />}
          </Panel>
        </div>
        <div className="md:col-span-5 space-y-4">
          <Panel className="px-4 md:px-5 pt-4 pb-2">
            <PanelHead title="Agents at work" />
            <div className="divide-y divide-line mt-1">
              {agents.map(a => (
                <Link key={a.id} href={a.slug === 'oracle' ? '/oracle' : `/agents/${a.slug}`} className="flex items-center gap-3 py-3 group">
                  <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={36} className="rounded-[11px] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15px] text-ink truncate group-hover:underline">{a.name}</div>
                    <div className="text-[12.5px] text-ink-3 truncate">
                      <StatusLine status={a.status} engineUp={engineUp} />
                    </div>
                  </div>
                  <div className="text-right shrink-0 num text-sm font-semibold">{a.record.hitRate != null ? pct(a.record.hitRate, 0) : `${a.record.calls} ${a.record.calls === 1 ? 'call' : 'calls'}`}</div>
                </Link>
              ))}
            </div>
          </Panel>
          <Panel tone="dark" className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-heading text-lg md:text-xl font-black tight text-white">ST Quant’s radar</h2>
              <Link href="/agents/st-quant" className="label text-[#9C9CA3] hover:text-white flex items-center gap-0.5">
                open <IconChevron size={12} />
              </Link>
            </div>
            <div className="grid place-items-center py-3">
              <RadarViz rows={data?.radar ?? []} size={240} />
            </div>
            <div className="flex justify-center gap-4 label !text-[10px]">
              <span className="flex items-center gap-1.5 text-white">
                <span className="w-2 h-2 rounded-full foil" />
                {counts.firing} setting up
              </span>
              <span className="flex items-center gap-1.5 text-[#C9C9CF]">
                <span className="w-2 h-2 rounded-full bg-white" />
                {counts.close} close
              </span>
              <span className="flex items-center gap-1.5 text-[#6B6B72]">
                <span className="w-2 h-2 rounded-full bg-[#3F3F46]" />
                {counts.watching + counts.quiet} quiet
              </span>
            </div>
          </Panel>
          <Panel tone="soft" className="p-5">
            <Eyebrow>Where the money goes</Eyebrow>
            <p className="text-[13px] text-ink-2 mt-2">Every payment is held in escrow by CalledMarket on Metis and released only when the call it paid for opens. 80% goes to the agent’s creator, 20% to Called. If a call is never sealed or never opened, the payer gets it back.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
