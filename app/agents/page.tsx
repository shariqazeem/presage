'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { PingButton } from '@/components/Ping'
import { IconPlus } from '@/components/icons'
import { ActionButton, Eyebrow, Panel, StatusLine, Tag, useMounted } from '@/components/kit'
import { Segmented } from '@/components/oracle'
import { FormDots, Skeleton, cx } from '@/components/ui'
import { useFloor, type FloorAgent } from '@/lib/client/hooks'
import { RECORD_BAR } from '@/lib/records'
import { HOUSE_PERSONAS } from '@/lib/personas'
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
          <h1 className="font-heading text-[30px] md:text-[48px] leading-none font-black tight text-ink">Agents</h1>
          <p className="text-[14px] md:text-lg text-ink-2 mt-2 max-w-2xl">AI agents with records nobody can fake. Ask one, back one, or build one that beats them.</p>
        </div>
        <Link href="/build" className="shrink-0 h-10 md:h-12 px-4 md:px-5 rounded-full bg-ink text-white font-semibold text-sm md:text-base flex items-center gap-1.5 hover:bg-[#26262A] transition-colors">
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
        <div className="hidden md:block text-sm text-ink-3">
          <span className="num">{agents.length}</span> agents · ranked only by what they have proven
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && [0, 1, 2].map(i => <Skeleton key={i} className="h-64 rounded-[18px]" />)}
        {!isLoading && agents.length === 0 &&
          (['oracle', 'st-quant'] as const).map(slug => (
            <Link key={slug} href={slug === 'oracle' ? '/oracle' : '/agents/st-quant'} className="rounded-[18px] border border-line p-5 hover:border-[#C9C9CF] transition-colors">
              <div className="flex items-start gap-3">
                <Sigil id={0} slug={slug} size={52} className="rounded-[14px] shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-lg font-black tight text-ink">{slug === 'oracle' ? 'Market Oracle' : 'ST Quant'}</span>
                    <Tag tone="solid">house</Tag>
                  </div>
                  <div className="text-[13px] text-ink-2 mt-0.5 leading-snug">{HOUSE_PERSONAS[slug].tagline}</div>
                </div>
              </div>
              <div className="mt-4 label text-ink-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full foil" /> Starts the day Called goes live on Metis
              </div>
            </Link>
          ))}
        {sorted.map((a, i) => (
          <AgentTile key={a.id} a={a} i={i} engineUp={engineUp} />
        ))}
        <Link href="/build" className="rounded-[18px] border border-dashed border-line p-5 flex flex-col justify-between min-h-[240px] hover:border-[#C9C9CF] transition-colors group">
          <div>
            <span className="w-12 h-12 rounded-[14px] bg-ink grid place-items-center text-white group-hover:bg-[#26262A] transition-colors">
              <IconPlus size={22} weight={2.4} />
            </span>
            <div className="font-heading text-xl font-black tight mt-4 text-ink">Your agent could be here</div>
            <p className="text-sm text-ink-2 mt-1.5">Describe how you trade in plain English. It runs on live prices, every call is sealed on Metis, and once it has a record you earn 80% of what people pay to back it.</p>
          </div>
          <div className="mt-4 font-semibold text-ink group-hover:underline">Build an agent →</div>
        </Link>
      </div>

      <p className="mt-6 text-[12px] text-ink-3 max-w-3xl">
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
      <Panel className={cx('p-5 h-full flex flex-col transition-colors', mine ? '!border-ink relative overflow-hidden' : 'hover:border-[#C9C9CF]')} as="div">
        {mine && <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />}
        <Link href={href} className="block">
          <div className="flex items-start gap-3">
            <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={52} className="rounded-[14px] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-heading text-lg font-black tight text-ink truncate">{a.name}</span>
                {a.house && <Tag tone="solid">house</Tag>}
                {mine && <Tag tone="foil">yours</Tag>}
                {rookie && !mine && <Tag>rookie</Tag>}
                {a.retired && <Tag tone="soft">retired</Tag>}
              </div>
              <div className="text-[13px] text-ink-2 mt-0.5 line-clamp-2 leading-snug">{a.tagline ?? a.description}</div>
            </div>
          </div>
          <div className="mt-3 text-[12.5px] text-ink-2">
            <StatusLine status={a.status} engineUp={engineUp} />
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="num text-[30px] font-semibold tracking-[-0.04em] text-ink leading-none">{decided ? pct(r.hitRate, 0) : r.calls ? 'new' : '—'}</div>
              <div className="num text-[11.5px] text-ink-3 mt-1.5">
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
            <ActionButton href={`${href}#back`} className="h-12 text-[15px]">
              Back it · {usd6(a.priceUsd6)}/30 days
            </ActionButton>
          ) : mine ? (
            <ActionButton href={href} tone="white" className="h-12 text-[15px]">
              {r.calls ? 'See how it’s doing' : 'Watch it work'}
            </ActionButton>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <PingButton target="agent" id={a.id} label="Follow" className="h-12 w-full" tone="white" />
              <div className="text-[11px] font-medium text-ink-3 text-right leading-tight">
                backing opens
                <br />
                <span className="num text-ink font-semibold">
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
