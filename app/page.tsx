'use client'

import Link from 'next/link'
import { ActionButton, Panel, Sealed } from '@/components/kit'
import { AgentCard, Floor, StatStrip } from '@/components/near/agent'
import { Terminal } from '@/components/near/Terminal'
import { NearButton, money } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { IconChevron, IconLock } from '@/components/icons'
import { USDC_ID, tokenById } from '@/lib/near/config'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { fromUnits } from '@/lib/near/units'

/** The floor: ParallaxPay at work, the analyst beside it, and the people it trades for, all on one page. */
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
  const open = desk?.positions.filter(p => p.status === 'open').length ?? 0

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-6 lg:px-8 pt-5 md:pt-10 pb-28 md:pb-16">
      {member && (
        <Link href="/desk" className="mb-6 flex items-center gap-4 rounded-[18px] bg-paper-2 px-4 py-3.5 hover:bg-[#EFEFEC] transition-colors">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-ink-3">Your account</div>
            <div className="num text-[20px] font-semibold leading-tight">{money(worth)}</div>
          </div>
          <div className="text-right text-[13px] text-ink-2 leading-snug">
            <div>{member.rules.autopilot ? 'Autopilot on' : 'Asks you first'}</div>
            <div className="text-ink-3">
              {open} open{waiting ? ` · ${waiting} waiting for you` : ''}
            </div>
          </div>
          {waiting > 0 && <span className="w-2.5 h-2.5 rounded-full foil" />}
          <IconChevron size={18} className="text-ink-3" />
        </Link>
      )}

      <section className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 lg:gap-12 items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12.5px] text-ink-2">
            <span className="w-1.5 h-1.5 rounded-full bg-up animate-[soft-pulse_2s_ease-in-out_infinite]" />
            Live on NEAR · trading {agent?.reads.map(r => r.coin).join(', ') || 'NEAR, ZEC, RHEA, AURORA'}
          </div>
          <h1 className="font-heading text-[42px] md:text-[62px] leading-[0.98] font-black tight mt-5">
            ParallaxPay trades for you, inside your <Sealed>rules</Sealed>.
          </h1>
          <p className="text-[16px] md:text-[19px] text-ink-2 leading-snug mt-4 md:mt-5 max-w-[600px]">
            An AI trading agent that reads charts like a trader: support, structure, momentum. It buys only when all of it lines up, seals its plan on NEAR before every trade, and trades from your own account in the vault.
          </p>
        </div>
        <div className="hidden lg:block lg:pb-1">
          <div className="grid sm:grid-cols-2 gap-2.5">
            {member ? (
              <ActionButton href="/desk">Open your desk</ActionButton>
            ) : accountId ? (
              <ActionButton href="/start">Get started</ActionButton>
            ) : (
              <NearButton variant="full" label="Get started" />
            )}
            <ActionButton href="/how-it-trades" tone="white">
              How it trades
            </ActionButton>
          </div>
          <ul className="mt-5 grid gap-2.5">
            {[
              ['Your rules live on NEAR.', 'The vault refuses any trade outside them.'],
              ['Every plan is sealed first.', 'Fingerprinted before the trade, opened after, losses included.'],
              ['It’s your money.', 'Stop the agent in one tap. Withdraw whenever you like.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-ink text-white grid place-items-center shrink-0">
                  <IconLock size={11} />
                </span>
                <p className="text-[14px] text-ink-2 leading-snug">
                  <b className="text-ink font-semibold">{t}</b> {d}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="live" className="mt-7 md:mt-10">
        <Terminal agent={agent} />
      </section>

      <ul className="lg:hidden mt-6 grid gap-2.5">
        {[
          ['Your rules live on NEAR.', 'The vault refuses any trade outside them.'],
          ['Every plan is sealed first.', 'Fingerprinted before the trade, opened after, losses included.'],
          ['It’s your money.', 'Stop the agent in one tap. Withdraw whenever you like.'],
        ].map(([t, d]) => (
          <li key={t} className="flex gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-ink text-white grid place-items-center shrink-0">
              <IconLock size={11} />
            </span>
            <p className="text-[14px] text-ink-2 leading-snug">
              <b className="text-ink font-semibold">{t}</b> {d}
            </p>
          </li>
        ))}
      </ul>

      <section className="mt-12 md:mt-16 grid lg:grid-cols-[1.25fr_0.75fr] gap-5">
        <Panel className="p-5 md:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-[22px] md:text-[26px] font-black tight">The floor</h2>
              <p className="text-[13.5px] text-ink-3 mt-0.5">The agents and the people they trade for, as it happens.</p>
            </div>
            <span className="flex items-center gap-1.5 label !text-[9.5px] text-up">
              <span className="w-1.5 h-1.5 rounded-full bg-up animate-[soft-pulse_2s_ease-in-out_infinite]" /> Live
            </span>
          </div>
          <div className="mt-3">
            <Floor lines={agent?.feed ?? []} max={14} />
          </div>
        </Panel>

        <div className="grid gap-4 content-start">
          <Panel className="p-5">
            <div className="label text-ink-3 mb-3">Its record so far</div>
            <StatStrip agent={agent} />
            <Link href="/record" className="mt-4 flex items-center justify-between text-[14px] font-semibold border-t border-line pt-3">
              Every trade, with its sealed plan <IconChevron size={16} />
            </Link>
          </Panel>
          <div className="grid gap-2.5">
            <div className="label text-ink-3">Who works here</div>
            <AgentCard id="parallaxpay" />
            <AgentCard id="analyst" />
          </div>
          <Panel tone="soft" className="p-5" as="div">
            <div className="font-heading text-[17px] font-black tight">Funds on another chain?</div>
            <p className="text-[13.5px] text-ink-2 leading-snug mt-1">NEAR Intents brings USDC, ETH, SOL or BTC over as USDC on NEAR, usually in under a minute.</p>
            <ActionButton href="/fund" tone="white" className="mt-3 !h-11 !text-[14px]">
              Bring funds to NEAR
            </ActionButton>
          </Panel>
        </div>
      </section>

      <section className="mt-12 md:mt-16">
        <h2 className="font-heading text-[22px] md:text-[26px] font-black tight">Three steps, about two minutes</h2>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          {[
            ['1', 'Set your rules', 'Ask first or autopilot, calm to bold, NEAR or ZEC, the largest buy and how many a day.'],
            ['2', 'Add USDC', 'From your NEAR wallet, or from Ethereum, Solana, Base or Bitcoin through NEAR Intents.'],
            ['3', 'Watch it work', 'Approve its proposals or let it trade. Every plan is sealed first, every trade has a receipt.'],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-[18px] border border-line p-5">
              <span className="num text-[13px] w-8 h-8 rounded-full bg-ink text-white grid place-items-center">{n}</span>
              <div className="font-heading text-[18px] font-black tight mt-4">{t}</div>
              <p className="text-[14px] text-ink-2 leading-snug mt-1">{d}</p>
            </div>
          ))}
        </div>
        {!member && (
          <div className="mt-6 max-w-[420px]">{accountId ? <ActionButton href="/start">Get started</ActionButton> : <NearButton variant="full" label="Connect a NEAR wallet to start" />}</div>
        )}
      </section>

      {!member && (
        <div className="md:hidden fixed inset-x-4 above-tabs z-40">
          <ActionButton href="/start" className="shadow-xl">
            Get started
          </ActionButton>
        </div>
      )}
      <p className="text-[12px] text-ink-3 mt-10">Not financial advice. ParallaxPay can lose money, and its record shows every loss.</p>
    </div>
  )
}
