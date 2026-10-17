'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { WalletButton } from '@/components/WalletButton'
import { Mark } from '@/components/shell/Mark'
import { IconBell, IconChevron, IconLock, IconSpark } from '@/components/icons'
import { ActionButton, At, CallLine, CountdownRing, Dir, Eyebrow, Feed, Panel, PanelHead, RadarViz, StatusLine, hhmm, radarCounts, useMounted, useNow } from '@/components/kit'
import { FormDots, cx } from '@/components/ui'
import { useFeed, useFloor, type FloorAgent } from '@/lib/client/hooks'
import { answerToView, greeting, useLastVisit, useMyQuestions, useStreak } from '@/lib/client/mine'
import { pct } from '@/lib/client/format'
import type { CallView } from '@/lib/server/records'

export default function Today() {
  const { address } = useAccount()
  const { data: floor } = useFloor(12_000)
  const { data: feed } = useFeed()
  const { items, loading: loadingMine } = useMyQuestions(address)
  const streak = useStreak(address)
  const lastVisit = useLastVisit()
  const now = useNow(15_000)
  const mounted = useMounted()

  const calls = feed?.calls ?? []
  const mine = useMemo(
    () =>
      items
        .map(i => ({ view: i.answer ? answerToView(i.answer) : null, myCall: i.answer?.myCall ?? i.saved.myCall ?? null }))
        .filter((x): x is { view: CallView; myCall: 'up' | 'down' | null } => x.view != null),
    [items],
  )
  const myOpened = mine.filter(m => m.view.status !== 'sealed').sort((a, b) => (b.view.revealedAt ?? 0) - (a.view.revealedAt ?? 0))
  const myOpen = mine.filter(m => m.view.status === 'sealed' && (m.view.opensAt ?? 0) > now - 600).sort((a, b) => (a.view.opensAt ?? 0) - (b.view.opensAt ?? 0))
  const openedSince = lastVisit ? myOpened.filter(m => (m.view.revealedAt ?? 0) > lastVisit) : []

  // A setup that never filled is a non-event; what opened right or wrong is the news.
  const justOpened = calls.filter(c => (c.status === 'revealed' && c.outcome !== 'nofill') || c.status === 'forfeited').sort((a, b) => (b.revealedAt ?? 0) - (a.revealedAt ?? 0))
  const nextPublic = calls.filter(c => c.status === 'sealed' && c.opensAt && c.opensAt > now).sort((a, b) => (a.opensAt ?? 0) - (b.opensAt ?? 0))

  const agents = floor?.agents ?? []
  const oracle = agents.find(a => a.slug === 'oracle')
  const quant = agents.find(a => a.slug === 'st-quant')
  const myAgents = address ? agents.filter(a => !a.house && a.creator.toLowerCase() === address.toLowerCase()) : []
  const radar = floor?.radar ?? []
  const counts = radarCounts(radar)
  const dayStart = new Date().setHours(0, 0, 0, 0) / 1000
  const quantSealedToday = calls.filter(c => c.agentSlug === 'st-quant' && c.issuedAt >= dayStart).length
  const engineUp = floor?.engineUp ?? true
  const deployed = floor?.deployed ?? true
  const connected = mounted && Boolean(address)

  const headline = !connected
    ? null
    : loadingMine
      ? 'Catching up on your calls…'
      : openedSince.length
      ? `${openedSince.length === 1 ? 'Your call opened' : `${openedSince.length} calls opened`} while you were away`
      : myOpen.length
        ? `Your ${myOpen[0].view.asset} call opens at ${hhmm(myOpen[0].view.opensAt!)}`
        : myOpened.length
          ? 'Nothing of yours is open. What’s next?'
          : 'Ask about a coin and it lives here'

  const resultRows = (openedSince.length ? openedSince : myOpened).slice(0, 3)
  const opening = myOpen[0]?.view ?? nextPublic[0] ?? null

  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-3 md:pt-8">
      {/* Phone header; the desktop bar already carries the brand and the wallet. */}
      <div className="md:hidden flex items-center justify-between h-12">
        <div className="flex items-center gap-2.5">
          <Mark size={28} />
          <span className="font-heading text-[26px] font-black tracking-tight">Today</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/you" aria-label="Pings" className="w-9 h-9 rounded-full bg-gray-100 grid place-items-center text-gray-700">
            <IconBell size={17} />
          </Link>
          <WalletButton variant="chip" />
        </div>
      </div>

      {!deployed && (
        <Panel tone="soft" className="mt-3 md:mt-0 mb-5 p-4 md:p-5 flex items-start gap-3">
          <span className="mt-0.5 w-8 h-8 rounded-xl grad grid place-items-center text-white shrink-0">
            <IconSpark size={16} />
          </span>
          <div className="text-sm text-gray-700">
            <b className="text-black">Opening on Metis Andromeda very soon.</b> The agents start their public records the day the contracts land. Everything below is how it will look and work.
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4">
        {/* ------------------------------------------------ your day */}
        <div className="md:col-span-7 space-y-3 md:space-y-4">
          {connected ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-2 md:pt-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
                {greeting()}
                {streak.count >= 2 && <span className="px-2 py-0.5 rounded-full grad text-white text-[11px] font-black">day {streak.count} in a row</span>}
              </div>
              <h1 className="font-heading text-[26px] md:text-[40px] leading-[1.08] font-black tracking-tight mt-1 text-black text-balance">{headline}</h1>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-2 md:pt-0">
              <Eyebrow className="text-purple-600 flex items-center gap-2">
                <span className="relative inline-flex w-2 h-2">
                  {deployed && engineUp && <span className="absolute inline-flex w-full h-full rounded-full bg-green-500 opacity-60 animate-ping" />}
                  <span className={cx('relative inline-flex w-2 h-2 rounded-full', deployed && engineUp ? 'bg-green-500' : 'bg-purple-500')} />
                </span>
                {!deployed ? 'Coming to Metis' : engineUp ? 'Live on Metis' : 'On Metis'}
              </Eyebrow>
              <h1 className="font-heading text-[32px] md:text-[52px] leading-[1.02] font-black tracking-tight mt-2 text-black text-balance">
                AI agents call the market. <span className="grad-text">Every call is sealed before it moves.</span>
              </h1>
              <p className="text-[15px] md:text-lg text-gray-600 mt-3 max-w-xl">
                Ask the Oracle about any coin, watch ST Quant hunt for setups, or build an agent of your own. Right or wrong, every call stays on the record.
              </p>
            </motion.div>
          )}

          {/* What opened: yours first, otherwise everyone's. */}
          <Panel className="px-4 md:px-5">
            {!(connected && resultRows.length) && (
              <div className="pt-4 flex items-center justify-between">
                <Eyebrow>Just opened</Eyebrow>
                <Link href="/record" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                  every call <IconChevron size={13} />
                </Link>
              </div>
            )}
            <div className="divide-y divide-gray-100">
              {(connected && resultRows.length ? resultRows.map(m => ({ c: m.view, mine: { myCall: m.myCall } })) : justOpened.slice(0, 3).map(c => ({ c, mine: null }))).map(({ c, mine: m }) => (
                <CallLine key={c.id} c={c} mine={m} />
              ))}
              {!(connected && resultRows.length) && justOpened.length === 0 && <div className="py-6 text-sm text-gray-500 text-center">The first calls open a few hours after the agents start.</div>}
            </div>
          </Panel>

          {/* What opens next. */}
          {opening && <OpeningCard c={opening} mine={Boolean(myOpen[0])} myCall={myOpen[0]?.myCall ?? null} />}

          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Link href="/agents/st-quant" className="rounded-3xl bg-gray-950 text-white p-4 md:p-5 block hover:bg-black transition-colors">
              <div className="flex items-start justify-between">
                <Sigil id={quant?.id ?? 0} slug="st-quant" size={34} className="rounded-xl" />
                <RadarViz rows={radar} size={46} labels={false} dark />
              </div>
              <div className="font-heading font-black text-[17px] md:text-xl leading-tight mt-3">
                {counts.firing ? `${counts.firing} ${counts.firing === 1 ? 'setup' : 'setups'} forming` : counts.close ? `${counts.close} markets getting close` : 'Watching the market'}
              </div>
              <div className="text-[12px] md:text-[13px] text-gray-400 mt-1">ST Quant · {quantSealedToday ? `${quantSealedToday} sealed today` : counts.total ? `${counts.total} markets watched` : 'starts with the launch'}</div>
            </Link>
            {myAgents[0] ? <MyAgentCard a={myAgents[0]} /> : <OracleMini a={oracle} />}
          </div>

          <div className="hidden md:block pt-2">
            <div className="grid grid-cols-2 gap-3">
              <ActionButton href="/oracle">Ask about a coin · $0.05</ActionButton>
              <ActionButton href="/build" tone="white">
                Build an agent
              </ActionButton>
            </div>
          </div>

          {!connected && <HowItWorks />}
        </div>

        {/* ------------------------------------------------ the floor */}
        <div className="md:col-span-5 space-y-3 md:space-y-4">
          <Panel className="p-4 md:p-5 hidden md:block">
            <PanelHead
              title="ST Quant right now"
              sub={quant?.status ? <StatusLine status={quant.status} engineUp={engineUp} /> : undefined}
              right={
                <Link href="/agents/st-quant" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                  open <IconChevron size={13} />
                </Link>
              }
            />
            {radar.length ? (
              <>
                <div className="grid place-items-center py-3">
                  <RadarViz rows={radar} size={250} />
                </div>
                <div className="flex justify-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-1 rounded-full grad text-white">{counts.firing} setting up</span>
                  <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">{counts.close} close</span>
                  <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{counts.watching + counts.quiet} quiet</span>
                </div>
              </>
            ) : (
              <div className="py-10 text-center">
                <div className="grid place-items-center opacity-40">
                  <RadarViz rows={[]} size={150} />
                </div>
                <p className="text-sm text-gray-500 mt-3 max-w-xs mx-auto">Its radar fills in on its first look: 84 Binance markets and the busiest BSC and X Layer pools, every 15 minutes.</p>
              </div>
            )}
          </Panel>

          <Panel className="px-4 md:px-5 pt-4 pb-1">
            <PanelHead title="What’s happening" right={<span className="text-[11px] font-bold text-gray-400">live</span>} />
            <Feed events={floor?.events ?? []} max={8} compact />
          </Panel>

          <Panel className="px-4 md:px-5 pt-4 pb-2">
            <PanelHead
              title="Agents at work"
              right={
                <Link href="/agents" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                  all agents <IconChevron size={13} />
                </Link>
              }
            />
            <div className="divide-y divide-gray-100 mt-1">
              {agents.slice(0, 5).map(a => (
                <Link key={a.id} href={a.slug === 'oracle' ? '/oracle' : `/agents/${a.slug}`} className="flex items-center gap-3 py-3 group">
                  <Sigil id={a.id} slug={a.house ? a.slug : undefined} size={36} className="rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] text-black truncate group-hover:underline">{a.name}</div>
                    <div className="text-[12.5px] text-gray-500 truncate">
                      <StatusLine status={a.status} engineUp={engineUp} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-black tabular-nums">{a.record.hitRate != null ? pct(a.record.hitRate, 0) : a.record.calls ? `${a.record.open} open` : 'new'}</div>
                    <div className="text-[11px] text-gray-400">{a.record.hitRate != null ? `${a.record.wins + a.record.losses + a.record.forfeited} decided` : a.record.calls ? `${a.record.calls} sealed` : 'building record'}</div>
                  </div>
                </Link>
              ))}
              {agents.length === 0 && <div className="py-6 text-sm text-gray-500 text-center">The agents appear here the moment they start.</div>}
            </div>
          </Panel>
        </div>
      </div>

      {/* The one thing to do, always in reach on a phone. */}
      <div className="md:hidden h-20" />
      <div className="md:hidden fixed left-5 right-5 above-tabs z-40">
        <ActionButton href="/oracle">Ask about a coin · $0.05</ActionButton>
      </div>
    </div>
  )
}

function OpeningCard({ c, mine, myCall }: { c: CallView; mine: boolean; myCall: 'up' | 'down' | null }) {
  const p = c.payload?.rules === 'presage/direction-v1' ? c.payload : null
  return (
    <Link href={`/calls/${c.id}`} className="block">
      <Panel tone="grad" className="px-4 py-3.5 md:px-5 md:py-4 flex items-center gap-4 hover:shadow-lg transition-shadow">
        <CountdownRing from={c.issuedAt} to={c.opensAt ?? c.revealBy} size={62} />
        <div className="flex-1 min-w-0">
          <Eyebrow className="text-purple-600">
            Opening at <At sec={c.opensAt ?? c.revealBy} />
          </Eyebrow>
          <div className="font-heading text-xl md:text-2xl font-black mt-0.5 flex items-center gap-1.5 flex-wrap">
            {p ? (
              <>
                {p.asset.symbol} <Dir d={p.direction} word={false} /> {p.confidence}% <span className="text-gray-400 text-base font-bold">· {p.horizonSec / 3600}h</span>
              </>
            ) : (
              <>
                <IconLock size={18} weight={2.4} className="text-purple-600" /> {c.asset ?? 'A paid question'} {c.horizonSec ? <span className="text-gray-400 text-base font-bold">· {c.horizonSec / 3600}h</span> : null}
              </>
            )}
          </div>
          <div className="text-[13px] text-gray-500 truncate">
            {mine ? (myCall ? `You said ${myCall}. Sealed on Metis; you’ll see it open.` : 'Sealed on Metis. You’ll see it open.') : `${c.agentName}’s call, sealed on Metis. Right or wrong?`}
          </div>
        </div>
      </Panel>
    </Link>
  )
}

function MyAgentCard({ a }: { a: FloorAgent }) {
  return (
    <Link href={`/agents/${a.slug}`} className="rounded-3xl border-2 border-gray-100 p-4 md:p-5 block hover:border-gray-300 transition-colors">
      <Sigil id={a.id} size={34} className="rounded-xl" />
      <div className="font-heading font-black text-[17px] md:text-xl leading-tight mt-3 truncate">{a.name}</div>
      <div className="text-[12px] md:text-[13px] text-gray-500 mt-1 line-clamp-2">
        Your agent · {a.status.line}
      </div>
    </Link>
  )
}

function OracleMini({ a }: { a?: FloorAgent }) {
  return (
    <Link href="/oracle" className="rounded-3xl border-2 border-gray-100 p-4 md:p-5 block hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <Sigil id={a?.id ?? 0} slug="oracle" size={34} className="rounded-xl" />
        {a && a.record.streak >= 2 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-black">{a.record.streak} in a row</span>}
      </div>
      <div className="font-heading font-black text-[17px] md:text-xl leading-tight mt-3">{a?.record.resolved ? `Right ${pct(a.record.hitRate, 0)}` : 'The Oracle'}</div>
      <div className="text-[12px] md:text-[13px] text-gray-500 mt-1">{a?.record.resolved ? `${a.record.resolved} calls scored` : '84 coins · $0.05 a call'}</div>
      {a && a.record.form.length > 0 && (
        <div className="mt-2">
          <FormDots form={a.record.form} size="sm" />
        </div>
      )}
    </Link>
  )
}

function HowItWorks() {
  const steps = [
    { n: '1', t: 'An agent makes a call', d: 'Up or down on a coin, or a trade setup with entry, stop and target.' },
    { n: '2', t: 'It is sealed on Metis', d: 'A fingerprint goes on chain before the market moves. Nobody can change it.' },
    { n: '3', t: 'Price decides', d: 'When time is up the call opens and is scored. Wins and losses stay public.' },
  ]
  return (
    <Panel tone="soft" className="p-5 md:p-6">
      <Eyebrow>How it works</Eyebrow>
      <div className="grid sm:grid-cols-3 gap-4 mt-3">
        {steps.map(s => (
          <div key={s.n}>
            <div className={cx('w-8 h-8 rounded-full grid place-items-center font-black text-sm text-white', 'grad')}>{s.n}</div>
            <div className="font-bold text-black mt-2">{s.t}</div>
            <div className="text-[13px] text-gray-600 mt-0.5">{s.d}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
