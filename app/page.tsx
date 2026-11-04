'use client'

import Link from 'next/link'
import { ActionButton, Sealed } from '@/components/kit'
import { AgentCard, Floor } from '@/components/near/agent'
import { Ask } from '@/components/near/Ask'
import { NearButton, money } from '@/components/near/kit'
import { RollingNumber } from '@/components/near/motion'
import { useNear } from '@/components/near/NearWallet'
import { Terminal } from '@/components/near/Terminal'
import { IconChevron, IconLock, IconLive, IconWallet } from '@/components/icons'
import { cx } from '@/components/ui'
import { USDC_ID, tokenById } from '@/lib/near/config'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { fromUnits } from '@/lib/near/units'

const TRUST = [
  { icon: IconLock, title: 'Your rules live on NEAR', text: 'The vault refuses any trade outside them.' },
  { icon: IconLive, title: 'Every plan is sealed first', text: 'Fingerprinted before the trade, opened after, losses included.' },
  { icon: IconWallet, title: 'It’s your money', text: 'Stop the agent in one tap. Withdraw whenever you like.' },
]

/** The floor: the agent at work first, everything else after. */
export default function Home() {
  const { accountId } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk } = useDesk(accountId)
  const member = desk?.member
  const prices = Object.fromEntries((agent?.reads ?? []).map(r => [r.token, r.price]))
  const worth = member
    ? Object.entries(member.balances).reduce((s, [id, v]) => {
        const t = tokenById(id)
        return t ? s + fromUnits(v, t.decimals) * (id === USDC_ID ? 1 : (prices[id] ?? 0)) : s
      }, 0)
    : 0
  const waiting = desk?.positions.filter(p => p.status === 'proposed' || p.exitProposed).length ?? 0
  const cta = member ? (
    <ActionButton href="/desk">Open your desk</ActionButton>
  ) : accountId ? (
    <ActionButton href="/start">Hire ParallaxPay</ActionButton>
  ) : (
    <NearButton variant="full" label="Hire ParallaxPay" />
  )

  return (
    <div className="max-w-[1320px] mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-8 pb-32 md:pb-16">
      {member ? (
        <Link href="/desk" className="mb-4 md:mb-6 flex items-center gap-4 rounded-[20px] bg-paper-2 px-4 py-3.5 press">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-ink-3">Your account</div>
            <RollingNumber value={money(worth)} className="text-[24px] font-semibold mt-1" />
          </div>
          <div className="text-right text-[13px] leading-snug">
            <div className="font-semibold">{member.rules.autopilot ? 'Autopilot on' : 'Asks you first'}</div>
            <div className={cx(waiting ? 'text-ink' : 'text-ink-3')}>{waiting ? `${waiting} waiting for you` : 'Nothing to approve'}</div>
          </div>
          {waiting > 0 && <span className="w-2.5 h-2.5 rounded-full foil" />}
          <IconChevron size={18} className="text-ink-3" />
        </Link>
      ) : (
        <section className="mb-5 md:mb-7">
          <h1 className="font-heading text-[30px] md:text-[44px] leading-[1.02] font-black tight">
            ParallaxPay trades for you, inside your <Sealed>rules</Sealed>.
          </h1>
          <div className="mt-3 flex flex-col md:flex-row md:items-center gap-4 md:gap-10">
            <p className="text-[15px] md:text-[17px] text-ink-2 leading-snug max-w-[640px] flex-1">An AI agent that reads charts like a trader and seals every plan on NEAR before it trades, from your own account in the vault.</p>
            <div className="hidden md:grid grid-cols-2 gap-2.5 w-[440px] shrink-0">
              {cta}
              <ActionButton href="/how-it-trades" tone="white">
                How it trades
              </ActionButton>
            </div>
          </div>
        </section>
      )}

      <section id="live">
        <Terminal agent={agent} />
      </section>

      {/* On narrower screens the terminal has no side rail, so asking and the floor come next. */}
      <section className="xl:hidden mt-4 grid md:grid-cols-2 gap-4">
        <div className="rounded-[22px] border border-line p-4 md:p-5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-2.5">Ask ParallaxPay</div>
          <Ask dark={false} coin={agent?.reads.find(r => r.setup)?.coin} />
        </div>
        <div className="rounded-[22px] border border-line p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">The floor</div>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-up">
              <span className="w-1.5 h-1.5 rounded-full bg-up animate-[soft-pulse_2s_ease-in-out_infinite]" /> Live
            </span>
          </div>
          <Floor lines={agent?.feed ?? []} max={6} />
        </div>
      </section>

      <section className="mt-5 md:mt-8 grid md:grid-cols-3 gap-3">
        {TRUST.map(t => (
          <div key={t.title} className="rounded-[20px] bg-paper-2 p-4 md:p-5 flex gap-3.5">
            <span className="w-10 h-10 rounded-full bg-ink text-white grid place-items-center shrink-0">
              <t.icon size={18} />
            </span>
            <div>
              <div className="font-semibold text-[15px]">{t.title}</div>
              <p className="text-[13.5px] text-ink-2 leading-snug mt-0.5">{t.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-5 md:mt-8 grid lg:grid-cols-[1fr_1fr_1fr] gap-3">
        <Link href="/record" className="rounded-[20px] border border-line p-5 press hover:border-ink-3">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Its record</div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div>
              <div className="num text-[22px] font-semibold">{agent?.record.closed ?? 0}</div>
              <div className="text-[12px] text-ink-3">trades</div>
            </div>
            <div>
              <div className="num text-[22px] font-semibold">{agent?.record.closed ? `${Math.round((agent.record.wins / agent.record.closed) * 100)}%` : '—'}</div>
              <div className="text-[12px] text-ink-3">ended up</div>
            </div>
            <div>
              <div className={cx('num text-[22px] font-semibold', agent && agent.record.pnlUsd < 0 && 'text-down', agent && agent.record.pnlUsd > 0 && 'text-up')}>{agent?.record.closed ? money(agent.record.pnlUsd, { sign: true }) : '—'}</div>
              <div className="text-[12px] text-ink-3">made</div>
            </div>
          </div>
          <div className="mt-4 text-[13.5px] font-semibold flex items-center gap-1">
            Every trade with its sealed plan <IconChevron size={15} />
          </div>
        </Link>
        <div className="grid gap-2.5 content-start">
          <AgentCard id="parallaxpay" />
          <AgentCard id="analyst" />
        </div>
        <Link href="/fund" className="rounded-[20px] bg-ink text-white p-5 press relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">NEAR Intents</div>
          <div className="font-heading text-[20px] font-black tight mt-2">Funds on another chain?</div>
          <p className="text-[13.5px] text-[#C9C9CF] leading-snug mt-1">USDC, ETH, SOL or BTC arrive as USDC on NEAR, usually within a minute.</p>
          <div className="mt-3 text-[13.5px] font-semibold flex items-center gap-1">
            Bring funds to NEAR <IconChevron size={15} />
          </div>
        </Link>
      </section>

      {!member && (
        <div className="md:hidden fixed inset-x-4 above-tabs z-40">
          <div className="rounded-[20px] bg-white/95 backdrop-blur-xl border border-line shadow-[0_12px_40px_-12px_rgba(11,11,12,0.35)] p-2">{cta}</div>
        </div>
      )}
      <p className="text-[12px] text-ink-3 mt-8">Not financial advice. ParallaxPay can lose money, and its record shows every loss.</p>
    </div>
  )
}
