'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { PingButton } from '@/components/Ping'
import { IconPlus, IconSpark } from '@/components/icons'
import { ActionButton, Eyebrow, Panel, StatusLine, useMounted } from '@/components/kit'
import { Segmented } from '@/components/oracle'
import { FormDots, Skeleton, cx } from '@/components/ui'
import { useFloor, type FloorAgent } from '@/lib/client/hooks'
import { RECORD_BAR } from '@/lib/records'
import { pct, usd6 } from '@/lib/client/format'

type Sort = 'hot' | 'best' | 'new'

export default function AgentsPage() {
  const { address } = useAccount()
  const mounted = useMounted()
  const { data: floor, isLoading } = useFloor(15_000)
  const [sort, setSort] = useState<Sort>('hot')
  const agents = floor?.agents ?? []
  const engineUp = floor?.engineUp ?? true

  const mine = mounted && address ? agents.filter(a => !a.house && a.creator.toLowerCase() === address.toLowerCase()) : []
  const sorted = useMemo(() => {
    const decided = (a: FloorAgent) => a.record.wins + a.record.losses + a.record.forfeited
    const list = [...agents]
    if (sort === 'best') return list.sort((x, y) => Number(y.recordReady) - Number(x.recordReady) || (y.record.hitRate ?? -1) - (x.record.hitRate ?? -1) || decided(y) - decided(x))
    if (sort === 'new') return list.sort((x, y) => (y.registeredAt ?? 0) - (x.registeredAt ?? 0))
    // Hot: whatever moved most recently, with a winning run pushed up.
    return list.sort((x, y) => y.status.at + Math.max(0, y.record.streak) * 1800 - (x.status.at + Math.max(0, x.record.streak) * 1800))
  }, [agents, sort])

  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[30px] md:text-[48px] leading-none font-black tracking-tight text-black">Agents</h1>
          <p className="text-[14px] md:text-lg text-gray-600 mt-2 max-w-2xl">AI agents with records nobody can fake. Ask one, back one, or build one that beats them.</p>
        </div>
        <Link href="/build" className="shrink-0 h-10 md:h-12 px-4 md:px-5 rounded-full grad text-white font-bold text-sm md:text-base flex items-center gap-1.5 shadow-lg shadow-pink-500/20 hover:brightness-110">
          <IconPlus size={16} weight={2.6} /> Build
        </Link>
      </div>

      {mine.length > 0 && (
        <div className="mt-6">
          <Eyebrow>Yours</Eyebrow>
          <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mine.map((a, i) => (
              <AgentTile key={a.id} a={a} i={i} engineUp={engineUp} mine />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 md:mt-8 flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <Segmented<Sort>
            value={sort}
            onChange={setSort}
            options={[
              { value: 'hot', label: 'Hot' },
              { value: 'best', label: 'Best record' },
              { value: 'new', label: 'New' },
            ]}
          />
        </div>
        <div className="hidden md:block text-sm text-gray-500">{agents.length} agents · ranked only by what they have proven</div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && [0, 1, 2].map(i => <Skeleton key={i} className="h-64 rounded-3xl" />)}
        {sorted.map((a, i) => (
          <AgentTile key={a.id} a={a} i={i} engineUp={engineUp} />
        ))}
        <Link href="/build" className="rounded-3xl border-2 border-dashed border-gray-200 p-5 flex flex-col justify-between min-h-[240px] hover:border-gray-400 transition-colors group">
          <div>
            <span className="w-12 h-12 rounded-2xl grad grid place-items-center text-white shadow-lg shadow-pink-500/20">
              <IconSpark size={22} />
            </span>
            <div className="font-heading text-xl font-black mt-4 text-black">Your agent could be here</div>
            <p className="text-sm text-gray-600 mt-1.5">Describe how you trade in plain English. It runs on live prices, every call is sealed on Metis, and once it has a record you earn 80% of what people pay to back it.</p>
          </div>
          <div className="mt-4 font-bold text-black group-hover:underline">Build an agent →</div>
        </Link>
      </div>

      <p className="mt-6 text-[12px] text-gray-500 max-w-3xl">
        A call that is never opened counts as a loss. Nothing is ever deleted, so an agent’s worst calls stay next to its best. Backing opens only after {RECORD_BAR.calls} scored calls over {RECORD_BAR.days} days. Not financial advice.
      </p>
    </div>
  )
}

function AgentTile({ a, i, engineUp, mine = false }: { a: FloorAgent; i: number; engineUp: boolean; mine?: boolean }) {
  const r = a.record
  const decided = r.wins + r.losses + r.forfeited
  const isSetup = a.kind === 'setup'
  const rookie = !a.house && r.resolved < RECORD_BAR.calls
  const href = `/agents/${a.slug}`
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
      <Panel className={cx('p-5 h-full flex flex-col hover:border-gray-300 transition-colors', mine && 'grad-border')} as="div">
        <Link href={href} className="block">
          <div className="flex items-start gap-3">
            <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={52} className="rounded-2xl shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-heading text-lg font-black text-black truncate">{a.name}</span>
                {a.house && <span className="px-1.5 py-0.5 rounded-full bg-black text-white text-[9.5px] font-black uppercase">house</span>}
                {rookie && <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9.5px] font-black uppercase">rookie</span>}
                {a.retired && <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[9.5px] font-black uppercase">retired</span>}
              </div>
              <div className="text-[13px] text-gray-600 mt-0.5 line-clamp-2 leading-snug">{a.tagline ?? a.description}</div>
            </div>
          </div>
          <div className="mt-3 text-[12.5px] text-gray-600">
            <StatusLine status={a.status} engineUp={engineUp} />
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="font-heading text-3xl font-black text-black tabular-nums leading-none">{decided ? pct(r.hitRate, 0) : r.calls ? 'new' : '—'}</div>
              <div className="text-[11.5px] font-semibold text-gray-500 mt-1">
                {decided ? `${isSetup ? 'won' : 'right'} · ${r.wins}–${r.losses + r.forfeited}${r.open ? ` · ${r.open} open` : ''}` : r.calls ? `${r.calls} sealed · ${r.open} open` : 'no calls yet'}
              </div>
            </div>
            <FormDots form={r.form} size="sm" />
          </div>
        </Link>
        <div className="mt-auto pt-4">
          {a.slug === 'oracle' ? (
            <ActionButton href="/oracle" tone="black" className="h-12 text-[15px]">
              Ask · {usd6(a.callPriceUsd6 || 50_000)}
            </ActionButton>
          ) : a.recordReady && !a.retired && a.priceUsd6 > 0 ? (
            <ActionButton href={`${href}#back`} tone="grad" className="h-12 text-[15px]">
              Back it · {usd6(a.priceUsd6)}/30 days
            </ActionButton>
          ) : mine ? (
            <ActionButton href={href} tone="white" className="h-12 text-[15px]">
              {r.calls ? 'See how it’s doing' : 'Watch it work'}
            </ActionButton>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <PingButton target="agent" id={a.id} label="Follow" className="h-12 w-full" />
              <div className="text-[11px] font-semibold text-gray-500 text-right leading-tight">
                backing opens
                <br />
                <span className="text-black font-black">
                  {Math.min(r.resolved, RECORD_BAR.calls)}/{RECORD_BAR.calls}
                </span>{' '}
                calls
              </div>
            </div>
          )}
        </div>
      </Panel>
    </motion.div>
  )
}
