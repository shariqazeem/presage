'use client'

import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { useAccount, useDisconnect, usePublicClient, useReadContracts, useWriteContract } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { WalletAvatar, WalletButton } from '@/components/WalletButton'
import { MyCalls, versus } from '@/components/MyCalls'
import { Earnings } from '@/components/Earnings'
import { IconBell, IconChevron, IconPlus, IconSend } from '@/components/icons'
import { ActionButton, Eyebrow, Panel, PanelHead, StatusLine, useMounted } from '@/components/kit'
import { cx } from '@/components/ui'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens } from '@/lib/chain'
import { useTelegramLink } from '@/lib/client/hooks'
import { useMyQuestions, useStreak } from '@/lib/client/mine'
import { pct, short, when } from '@/lib/client/format'
import type { AgentSummary } from '@/lib/records'
import type { AgentStatus } from '@/lib/floor-types'

type Me = { address: string; agents: (AgentSummary & { status: AgentStatus })[]; backing: { agentId: number; until: number; slug: string; name: string; house: boolean }[]; telegram: boolean; signedIn: boolean }

export default function YouPage() {
  const mounted = useMounted()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const streak = useStreak(address)
  const { items } = useMyQuestions(address)
  const openTelegram = useTelegramLink()
  const { data: me, refetch } = useQuery({
    queryKey: ['me', address],
    enabled: Boolean(address),
    queryFn: async () => (await (await fetch(`/api/me?address=${address}`)).json()) as Me,
    refetchInterval: 30_000,
  })

  if (!mounted) return <div className="min-h-[60vh]" />

  if (!isConnected || !address) {
    return (
      <div className="max-w-xl mx-auto px-5 pt-12 md:pt-20 text-center">
        <div className="w-16 h-16 rounded-3xl grad mx-auto grid place-items-center text-white shadow-xl shadow-pink-500/20">
          <IconBell size={28} />
        </div>
        <h1 className="font-heading text-[34px] md:text-[48px] leading-none font-black tracking-tight mt-6">Your corner of Presage</h1>
        <p className="text-gray-600 mt-3">Connect a wallet to keep your calls, the agents you build and back, and your pings in one place. Watching everything else stays free.</p>
        <div className="mt-6">
          <WalletButton variant="full" label="Connect a wallet" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-8 text-left">
          {[
            ['Your calls', 'Every question you asked and how it came out.'],
            ['Your agents', 'What they are watching, and what they earned.'],
            ['Pings', 'A message the moment something of yours opens.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-gray-50 p-3">
              <div className="font-bold text-sm text-black">{t}</div>
              <div className="text-[12px] text-gray-500 mt-1">{d}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const score = versus(items)
  const opened = items.filter(i => i.answer?.call && i.answer.call.status !== 'sealed')
  const right = opened.filter(i => i.answer?.call?.outcome === 'win').length

  return (
    <div className="max-w-[1320px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <div className="flex items-center gap-4">
        <WalletAvatar address={address} size={56} />
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[24px] md:text-[40px] leading-none font-black tracking-tight whitespace-nowrap">{short(address)}</div>
          <div className="text-sm text-gray-500 mt-1.5 flex items-center gap-2 flex-wrap">
            {streak.count >= 2 ? <span className="px-2 py-0.5 rounded-full grad text-white text-[11px] font-black">day {streak.count} in a row</span> : <span>Welcome back</span>}
            {streak.best > streak.count && <span>best run {streak.best} days</span>}
          </div>
        </div>
        <button onClick={() => disconnect()} className="text-[12px] font-bold text-gray-500 border-2 border-gray-100 rounded-full px-3 py-1.5 hover:border-gray-300 shrink-0">
          Disconnect
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 mt-6 md:mt-8">
        <div className="md:col-span-7 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Big label="calls asked" value={String(items.length)} />
            <Big label="came out right" value={opened.length ? `${right}/${opened.length}` : '—'} />
            <Big label="you vs the Oracle" value={score.played ? `${score.you}–${score.oracle}` : '—'} hint={score.played ? (score.you > score.oracle ? 'you’re ahead' : score.you < score.oracle ? 'it’s ahead' : 'level') : 'call it first next time'} />
          </div>

          <Panel className="px-4 md:px-5 pt-4 pb-1">
            <PanelHead
              title="Your calls"
              sub="Saved on this device, each with how it came out."
              right={
                <Link href="/oracle" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                  ask <IconChevron size={13} />
                </Link>
              }
            />
            {items.length ? <MyCalls items={items} max={20} /> : <div className="py-6 text-sm text-gray-500">Nothing yet. Ask the Oracle about any coin and it lands here, with a countdown to when it opens.</div>}
          </Panel>
        </div>

        <div className="md:col-span-5 space-y-4">
          <Panel tone="grad" className="p-5" as="div">
            <Eyebrow className="text-purple-600">Pings</Eyebrow>
            <div className="font-heading text-xl font-black mt-1">Hear the moment something of yours opens</div>
            <p className="text-[13px] text-gray-600 mt-1.5">Your calls opening, the agents you follow sealing a call, your own agent firing.</p>
            <button
              onClick={() => (process.env.NEXT_PUBLIC_TELEGRAM_BOT ? openTelegram().then(() => refetch()) : Promise.resolve(toast('Telegram pings switch on with the launch.', { icon: '🔔' }))).catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))}
              className={cx('mt-4 w-full h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2', me?.telegram ? 'bg-green-600 text-white' : 'bg-black text-white hover:bg-gray-800')}
            >
              <IconSend size={16} /> {me?.telegram ? 'Telegram is linked' : 'Link Telegram'}
            </button>
          </Panel>

          <Panel className="px-4 md:px-5 pt-4 pb-2">
            <PanelHead
              title="Your agents"
              right={
                <Link href="/build" className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-0.5">
                  <IconPlus size={12} /> build
                </Link>
              }
            />
            {me?.agents.length ? (
              <div className="divide-y divide-gray-100 mt-1">
                {me.agents.map(a => (
                  <Link key={a.id} href={`/agents/${a.slug}`} className="flex items-center gap-3 py-3 group">
                    <Sigil id={a.id} size={40} className="rounded-xl shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-black truncate group-hover:underline">{a.name}</div>
                      <div className="text-[12.5px] text-gray-500 truncate">
                        <StatusLine status={a.status} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black tabular-nums">{a.record.wins + a.record.losses + a.record.forfeited ? pct(a.record.hitRate, 0) : `${a.record.calls} calls`}</div>
                      <div className="text-[11px] text-gray-400">{a.subscribers} backing</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-4">
                <div className="text-sm text-gray-500">You haven’t built one yet. Pick a style, make it yours, and it starts watching the market in a minute.</div>
                <ActionButton href="/build" tone="white" className="mt-3 h-12 text-[15px]">
                  Build an agent
                </ActionButton>
              </div>
            )}
            <Earnings address={address} />
          </Panel>

          <Panel className="px-4 md:px-5 pt-4 pb-2">
            <PanelHead title="Agents you back" />
            {me?.backing.length ? (
              <div className="divide-y divide-gray-100 mt-1">
                {me.backing.map(b => (
                  <Link key={b.agentId} href={`/agents/${b.slug}`} className="flex items-center gap-3 py-3">
                    <Sigil id={b.agentId} slug={b.house ? b.slug : undefined} size={36} className="rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0 font-bold text-black truncate">{b.name}</div>
                    <div className="text-[12px] text-gray-500 shrink-0">until {when(b.until)}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-4 text-sm text-gray-500">None yet. Backing an agent shows you its setups the moment they’re sealed.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Big({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="p-3.5 md:p-5">
      <div className="font-heading text-2xl md:text-4xl font-black tabular-nums text-black leading-none">{value}</div>
      <div className="text-[11.5px] md:text-[13px] font-semibold text-gray-500 mt-1.5 leading-tight">{label}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5 hidden md:block">{hint}</div>}
    </Panel>
  )
}
