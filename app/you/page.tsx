'use client'

import Link from 'next/link'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useDisconnect } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { WalletAvatar, WalletButton } from '@/components/WalletButton'
import { MyCalls, versus } from '@/components/MyCalls'
import { Earnings } from '@/components/Earnings'
import { IconBell, IconCheck, IconChevron, IconPlus, IconSend } from '@/components/icons'
import { ActionButton, Eyebrow, Panel, PanelHead, StatusLine, Tag, useMounted } from '@/components/kit'
import { cx } from '@/components/ui'
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
        <div className="relative w-16 h-16 rounded-[18px] bg-ink mx-auto grid place-items-center text-white">
          <IconBell size={28} />
          <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 rounded-full foil ring-2 ring-ink" />
        </div>
        <h1 className="font-heading text-[34px] md:text-[48px] leading-none font-black tight mt-6">All yours, in one place</h1>
        <p className="text-ink-2 mt-3">Connect a wallet to keep your calls, the agents you build and back, and your pings in one place. Watching everything else stays free.</p>
        <div className="mt-6">
          <WalletButton variant="full" label="Connect a wallet" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mt-8 text-left">
          {[
            ['Your calls', 'Every question you asked and how it came out.'],
            ['Your agents', 'What they are watching, and what they earned.'],
            ['Pings', 'A message the moment something of yours opens.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-[14px] border border-line px-4 py-3 sm:p-3 flex sm:block items-baseline gap-3">
              <div className="font-heading font-black tight text-sm text-ink shrink-0 w-24 sm:w-auto">{t}</div>
              <div className="text-[12.5px] sm:text-[12px] text-ink-3 sm:mt-1">{d}</div>
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
          <div className="num text-[22px] md:text-[36px] leading-none font-semibold tracking-[-0.04em] whitespace-nowrap">{short(address)}</div>
          <div className="text-sm text-ink-3 mt-2 flex items-center gap-2 flex-wrap">
            {streak.count >= 2 ? <Tag tone="foil">day {streak.count} in a row</Tag> : <span>Welcome back</span>}
            {streak.best > streak.count && <span className="num text-[12px]">best run {streak.best} days</span>}
          </div>
        </div>
        <button onClick={() => disconnect()} className="text-[12px] font-semibold text-ink-3 border border-line rounded-full px-3 py-1.5 hover:border-[#C9C9CF] hover:text-ink shrink-0">
          Disconnect
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 mt-6 md:mt-8">
        <div className="md:col-span-7 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Big label={items.length === 1 ? 'call asked' : 'calls asked'} value={String(items.length)} />
            <Big label="came out right" value={opened.length ? `${right}/${opened.length}` : '—'} />
            <Big label="you vs the Oracle" value={score.played ? `${score.you}–${score.oracle}` : '—'} hint={score.played ? (score.you > score.oracle ? 'you’re ahead' : score.you < score.oracle ? 'it’s ahead' : 'level') : items.some(i => i.saved.myCall) ? 'your first one opens soon' : 'call it first next time'} />
          </div>

          <Panel className="px-4 md:px-5 pt-4 pb-1">
            <PanelHead
              title="Your calls"
              sub="Saved on this device, each with how it came out."
              right={
                <Link href="/oracle" className="label text-ink-3 hover:text-ink flex items-center gap-0.5">
                  ask <IconChevron size={12} />
                </Link>
              }
            />
            {items.length ? <MyCalls items={items} max={20} /> : <div className="py-6 text-sm text-ink-3">Nothing yet. Ask the Oracle about any coin and it lands here, with a countdown to when it opens.</div>}
          </Panel>
        </div>

        <div className="md:col-span-5 space-y-4">
          <Panel tone="ticket" className="p-5" as="div">
            <Eyebrow className="text-[#9C9CA3] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full foil" />
              Pings
            </Eyebrow>
            <div className="font-heading text-xl font-black tight mt-1.5">Hear the moment something of yours opens</div>
            <p className="text-[13px] text-[#9C9CA3] mt-1.5">Your calls opening, the agents you follow sealing a call, your own agent firing.</p>
            <button
              onClick={() => (process.env.NEXT_PUBLIC_TELEGRAM_BOT ? openTelegram().then(() => refetch()) : Promise.resolve(toast('Telegram pings switch on with the launch.', { icon: '🔔' }))).catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))}
              className={cx('mt-4 w-full h-12 rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors', me?.telegram ? 'bg-white/10 text-white' : 'bg-white text-ink hover:bg-[#EDEDEA]')}
            >
              {me?.telegram ? <IconCheck size={16} weight={3} className="text-up-d" /> : <IconSend size={16} />} {me?.telegram ? 'Telegram is linked' : 'Link Telegram'}
            </button>
          </Panel>

          <Panel className="px-4 md:px-5 pt-4 pb-2">
            <PanelHead
              title="Your agents"
              right={
                <Link href="/build" className="label text-ink-3 hover:text-ink flex items-center gap-0.5">
                  <IconPlus size={11} /> build
                </Link>
              }
            />
            {me?.agents.length ? (
              <div className="divide-y divide-line mt-1">
                {me.agents.map(a => (
                  <Link key={a.id} href={`/agents/${a.slug}`} className="flex items-center gap-3 py-3 group">
                    <Sigil id={a.id} size={40} className="rounded-[12px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink truncate group-hover:underline">{a.name}</div>
                      <div className="text-[12.5px] text-ink-3 truncate">
                        <StatusLine status={a.status} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num text-sm font-semibold">{a.record.wins + a.record.losses + a.record.forfeited ? pct(a.record.hitRate, 0) : `${a.record.calls} ${a.record.calls === 1 ? 'call' : 'calls'}`}</div>
                      <div className="num text-[11px] text-ink-3">{a.subscribers} backing</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-4">
                <div className="text-sm text-ink-3">You haven’t built one yet. Pick a style, make it yours, and it starts watching the market in a minute.</div>
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
              <div className="divide-y divide-line mt-1">
                {me.backing.map(b => (
                  <Link key={b.agentId} href={`/agents/${b.slug}`} className="flex items-center gap-3 py-3">
                    <Sigil id={b.agentId} slug={b.house ? b.slug : undefined} size={36} className="rounded-[11px] shrink-0" />
                    <div className="flex-1 min-w-0 font-semibold text-ink truncate">{b.name}</div>
                    <div className="num text-[11.5px] text-ink-3 shrink-0 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full foil" />
                      until {when(b.until)}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-4 text-sm text-ink-3">None yet. Backing an agent shows you its setups the moment they’re sealed.</div>
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
      <div className="num text-[22px] md:text-[34px] font-semibold tracking-[-0.04em] text-ink leading-none">{value}</div>
      <div className="text-[11.5px] md:text-[13px] font-medium text-ink-3 mt-2 leading-tight">{label}</div>
      {hint && <div className="text-[11px] text-ink-3 mt-0.5 hidden md:block">{hint}</div>}
    </Panel>
  )
}
