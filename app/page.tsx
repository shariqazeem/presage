'use client'

import Link from 'next/link'
import { ActionButton, Sealed } from '@/components/kit'
import { AGENTS, Avatar, Floor } from '@/components/near/agent'
import { Ask } from '@/components/near/Ask'
import { usd } from '@/components/near/kit'
import { MandateCard } from '@/components/near/Mandate'
import { RollingNumber } from '@/components/near/motion'
import { useNear } from '@/components/near/NearWallet'
import { Promises } from '@/components/near/Promises'
import { Stage } from '@/components/near/Stage'
import { IconChevron, IconLock, IconLive, IconWallet } from '@/components/icons'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import { COINS, USDC, USDC_ID, tokenById } from '@/lib/near/config'
import { useAgentState, useDesk, usePresence } from '@/lib/near/hooks'
import { fromUnits, toUnits } from '@/lib/near/units'
import { coinsInWords, type Rules } from '@/lib/near/vault'

const TRUST = [
  { icon: IconLock, title: 'Your mandate lives on NEAR', text: 'The vault refuses any trade outside it.' },
  { icon: IconLive, title: 'Every plan is sealed first', text: 'Fingerprinted on NEAR before the trade, opened after, losses included.' },
  { icon: IconWallet, title: 'Your money stays yours', text: 'Revoke in one tap. Withdraw whenever you like.' },
]

/** An example draft for visitors: what a first mandate usually looks like. */
const EXAMPLE: Rules = { autopilot: false, max_trade: toUnits(10, USDC.decimals).toString(), trades_per_day: 2, coins: [COINS[0].id, COINS[1].id], style: 1 }

/** The floor: ParallaxPay at work, the people and agents around it, and how to hire it. */
export default function Home() {
  const { accountId } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk } = useDesk(accountId)
  const { data: here } = usePresence()
  const member = desk?.member
  const prices = Object.fromEntries((agent?.reads ?? []).map(r => [r.token, r.price]))
  const worth = member
    ? Object.entries(member.balances).reduce((s, [id, v]) => {
        const t = tokenById(id)
        return t ? s + fromUnits(v, t.decimals) * (id === USDC_ID ? 1 : (prices[id] ?? 0)) : s
      }, 0)
    : 0
  const waiting = desk?.positions.filter(p => p.status === 'proposed' || p.exitProposed).length ?? 0
  const watching = member ? coinsInWords(member.rules.coins, 'every coin it trades') : ''
  const cta = member ? (
    <ActionButton href="/desk">Your agent</ActionButton>
  ) : (
    <ActionButton href="/start">Hire ParallaxPay</ActionButton>
  )

  return (
    <div className="max-w-[1320px] mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-7 pb-32 md:pb-16">
      {member ? (
        <Link href="/desk" className="mb-4 md:mb-5 flex items-center gap-3.5 rounded-[20px] bg-paper-2 px-4 py-3.5 press">
          <Mark size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold leading-tight truncate">Your ParallaxPay is watching {watching || 'the market'} for you</div>
            <div className={cx('text-[12.5px] mt-0.5', waiting ? 'text-ink' : 'text-ink-3')}>{waiting ? `${waiting} waiting for your answer` : member.rules.autopilot ? 'Autopilot, inside your mandate' : 'It asks before every trade'}</div>
          </div>
          <RollingNumber value={usd(worth)} className="text-[18px] md:text-[20px] font-semibold" />
          {waiting > 0 && <span className="w-2.5 h-2.5 rounded-full foil" />}
          <IconChevron size={18} className="text-ink-3" />
        </Link>
      ) : (
        <section className="mb-5 md:mb-6 flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-10">
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-[27px] md:text-[44px] leading-[1.04] font-black tight">
              ParallaxPay trades for you, inside your <Sealed>rules</Sealed>.
            </h1>
            <p className="hidden sm:block mt-3 text-[15px] md:text-[17px] text-ink-2 leading-snug max-w-[680px]">Watch it read the market below, then hire it. Every plan is sealed on NEAR before it trades.</p>
          </div>
          <div className="hidden md:grid grid-cols-2 gap-2.5 w-[420px] shrink-0">
            {cta}
            <ActionButton href="/how-it-trades" tone="white">
              How it trades
            </ActionButton>
          </div>
        </section>
      )}

      <section id="live">
        <Stage agent={agent} />
      </section>

      {/* the room: agents and people */}
      <section className="mt-4 md:mt-6 grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <div className="rounded-[22px] border border-line p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">The floor</div>
              <div className="font-heading text-[18px] font-black tight mt-0.5">Agents and people, live</div>
            </div>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-up shrink-0 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-up animate-[soft-pulse_2s_ease-in-out_infinite]" /> {here ? `${here} here` : 'Live'}
            </span>
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {(['parallaxpay', 'analyst'] as const).map(id => (
              <Link key={id} href="/how-it-trades" className="flex items-center gap-2.5 rounded-[14px] bg-paper-2 px-3 py-2.5 press">
                <Avatar actor={id} size={30} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-tight">{AGENTS[id].name}</div>
                  <div className="text-[12px] text-ink-3 truncate">{id === 'parallaxpay' ? 'Trader · reads every 15 minutes' : 'NEAR AI in a TEE · reviews before money moves'}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-2">
            <Floor lines={agent?.feed ?? []} max={7} />
          </div>
        </div>
        <div className="grid gap-4 content-start">
          <div className="rounded-[22px] border border-line p-4 md:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Ask it</div>
            <div className="font-heading text-[18px] font-black tight mt-0.5 mb-3">It answers from what it sees now</div>
            <Ask dark={false} coin={agent?.reads.find(r => r.setup)?.coin ?? agent?.reads[0]?.coin} />
          </div>
          <Promises />
        </div>
      </section>

      {/* hiring it */}
      <section className="mt-4 md:mt-6 grid lg:grid-cols-2 gap-4">
        {member ? (
          <div className="rounded-[22px] bg-paper-2 p-4 md:p-6 flex flex-col">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Your mandate</div>
            <div className="font-heading text-[22px] font-black tight mt-1">What your ParallaxPay may do</div>
            <MandateCard rules={member.rules} state="signed" signer={accountId} compact className="mt-4" footer={<Link href="/desk" className="text-[13px] font-semibold">Change</Link>} />
          </div>
        ) : (
          <div className="rounded-[22px] bg-paper-2 p-4 md:p-6 grid md:grid-cols-[1fr_1.1fr] lg:grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-5 items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Hire it</div>
              <div className="font-heading text-[24px] md:text-[28px] font-black tight leading-[1.05] mt-1">Give it a mandate, not your keys.</div>
              <ol className="mt-4 grid gap-2.5">
                {['Write the mandate: coins, size, how often, ask first or autopilot.', 'Sign it with your NEAR wallet. The vault enforces it.', 'Add USDC. It trades only from your own account.'].map((s, i) => (
                  <li key={s} className="flex gap-2.5 text-[14px] text-ink-2 leading-snug">
                    <span className="w-5 h-5 rounded-full bg-ink text-white grid place-items-center text-[11px] font-semibold shrink-0 mt-[1px]">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              {/* On phones the button rides above the tab bar the whole way down, so it isn't shown twice. */}
              <div className="mt-5 max-w-[260px] hidden md:block">{cta}</div>
            </div>
            <MandateCard rules={EXAMPLE} compact />
          </div>
        )}
        <div className="grid gap-3 content-start">
          {TRUST.map(t => (
            <div key={t.title} className="rounded-[20px] border border-line p-4 flex gap-3.5">
              <span className="w-10 h-10 rounded-full bg-ink text-white grid place-items-center shrink-0">
                <t.icon size={18} />
              </span>
              <div>
                <div className="font-semibold text-[15px]">{t.title}</div>
                <p className="text-[13.5px] text-ink-2 leading-snug mt-0.5">{t.text}</p>
              </div>
            </div>
          ))}
          <Link href="/fund" className="rounded-[20px] bg-ink text-white p-4 press relative overflow-hidden flex items-center gap-3.5">
            <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[15px]">Funds on another chain?</div>
              <p className="text-[13.5px] text-[#C9C9CF] leading-snug mt-0.5">USDC, ETH, SOL or BTC arrive as USDC on NEAR through NEAR Intents: Solana and Base in under a minute, Bitcoin in about 13.</p>
            </div>
            <IconChevron size={18} className="text-[#8A8A92] shrink-0" />
          </Link>
        </div>
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
