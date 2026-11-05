'use client'

import { useState } from 'react'
import { ActionButton } from '@/components/kit'
import { IconChevron } from '@/components/icons'
import { AGENTS, Avatar, Checklist, StatStrip } from '@/components/near/agent'
import { AgentDrawing } from '@/components/near/AgentDrawing'
import { NearButton } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { focusOf, voice } from '@/components/near/Stage'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import type { DrawTf } from '@/lib/near/drawing'
import { useAgentState } from '@/lib/near/hooks'
import { ranked } from '@/lib/near/rank'
import { COINS, coinBySymbol } from '@/lib/near/config'
import { CoinIcon } from '@/components/near/coins'

const METHOD: { title: string; text: string; tf: DrawTf; look: string }[] = [
  {
    title: 'Find the real level',
    text: 'It maps support on four timeframes: horizontal shelves, rising trendlines, the floor of a narrowing pattern. A level only the 15-minute chart can see doesn’t count; it has to show up on a higher timeframe too.',
    tf: '4h',
    look: 'Dashed green lines are support and red ones resistance, each with how many times price turned there. The solid lines are the trendlines it fits, the way a trader draws them.',
  },
  {
    title: 'Be at it, not near it',
    text: 'It buys only with price sitting on that support. Halfway up the range, the honest stop is far below, so it waits for the retest instead.',
    tf: '1h',
    look: 'The foil line is the one level it is trading right now. It acts only when price is sitting on it.',
  },
  {
    title: 'Wait for money flow to bottom',
    text: 'Money Flow Index has to be at the bottom of its own range: 15-minute MFI at 20 or less, or hourly at 25 or less, in the lowest 15% of its recent readings. Rising MFI is the move already happening, not a buy.',
    tf: '15m',
    look: 'Money flow is the purple line under the chart. The shaded dips below 20 are the bottoms it buys from.',
  },
  {
    title: 'Check the bigger picture',
    text: 'The daily and 4-hour structure must be building, not breaking, and the daily trend not falling. A clean 15-minute setup inside a collapsing daily chart is a pass.',
    tf: '1d',
    look: 'On the daily chart the trend has to be building. A falling daily trendline means it stays out, however good the smaller chart looks.',
  },
]

const RISK = [
  ['A stop just under the level', 'If the support it bought breaks, the plan was wrong, so the stop sits right below it. Losses stay small by design.'],
  ['Targets from the chart', 'It sells at the pattern’s own resistance. At the first resistance it sells only if the move is tiring there; otherwise it holds for the second.'],
  ['Room to win', 'A setup needs at least 2.5 times the risk in reward, or it isn’t taken.'],
  ['Your mandate on top', 'Your largest buy, buys per day and coins are enforced by the vault on NEAR, whatever the agent thinks.'],
]

const PIPELINE = [
  { who: 'ParallaxPay', role: 'Trader agent', text: 'Reads four timeframes, runs its six checks and drafts a plan: entry, stop, target.', actor: 'parallaxpay' },
  { who: 'Analyst', role: 'NEAR AI, in a TEE', text: 'A second agent reads the same chart against the same rubric. It can pass or lower the grade, never raise it, and its enclave signs the answer.', actor: 'analyst' },
  { who: 'The vault', role: 'Contract on NEAR', text: 'Seals the plan’s fingerprint, then trades only inside the member’s mandate, from their own account.', actor: null },
  { who: 'Rhea', role: 'Exchange on NEAR', text: 'Executes the exact-amount swap. The plan opens on NEAR when the trade ends, win or loss.', actor: null },
]

/** ParallaxPay's profile: who it is, how it decides, the agents it works with, and its live checks. */
export default function HowItTrades() {
  const { accountId } = useNear()
  const { data: agent } = useAgentState()
  const [step, setStep] = useState(0)
  const [shot, setShot] = useState<string | null>(null)
  const reads = ranked(agent?.reads ?? [])
  const lead = reads[0]
  const [pick, setPick] = useState<string | null>(null)
  const now = reads.find(r => r.coin === pick) ?? lead
  const m = METHOD[step]
  const cta = accountId ? <ActionButton href="/start">Hire ParallaxPay</ActionButton> : <NearButton variant="full" label="Hire ParallaxPay" />

  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 lg:px-8 pt-5 md:pt-9 pb-24 md:pb-16">
      {/* the profile */}
      <section className="rounded-[28px] bg-ink text-white p-5 md:p-8 relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          <div className="relative w-fit shrink-0">
            <span className="absolute -inset-3 rounded-[28px] foil opacity-45 blur-[18px] animate-[soft-pulse_2.6s_ease-in-out_infinite]" />
            <span className="relative block">
              <Mark size={84} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-[#A1A1AA] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-up-d animate-[soft-pulse_2s_ease-in-out_infinite]" /> AI trader · live on NEAR
            </div>
            <h1 className="font-heading text-[34px] md:text-[52px] leading-[1.02] font-black tight mt-1.5">It reads the chart like a trader</h1>
            <p className="text-[15.5px] md:text-[17px] text-[#C9C9CF] leading-snug mt-3 max-w-[680px]">
              Its creator&rsquo;s own trading rules: buy where support is real and money flow is spent, stop right under it, sell where the pattern says the move ends. Six checks on every coin it trades on Rhea.
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 max-w-[560px]">
          {[
            [String(COINS.length), 'coins it watches'],
            ['15 min', 'between reads'],
            ['6', 'checks before a trade'],
          ].map(([v, k]) => (
            <div key={k} className="rounded-[16px] bg-white/[0.06] px-3.5 py-3">
              <div className="num text-[20px] md:text-[22px] font-semibold">{v}</div>
              <div className="text-[12px] text-[#8A8A92] leading-tight mt-0.5">{k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* the method, shown on its own drawings */}
      <section className="mt-8 md:mt-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">The method</div>
        <h2 className="font-heading text-[26px] md:text-[32px] font-black tight mt-1">Four questions before every trade</h2>
        <div className="mt-5 grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 items-start">
          <ol className="grid gap-2">
            {METHOD.map((x, i) => (
              <li key={x.title}>
                <button onClick={() => setStep(i)} className={cx('w-full text-left rounded-[20px] p-4 border-2 press transition-colors', i === step ? 'border-ink bg-white' : 'border-transparent bg-paper-2 hover:bg-[#EFEFEC]')}>
                  <div className="flex items-center gap-3">
                    <span className={cx('w-7 h-7 rounded-full grid place-items-center num text-[12px] font-semibold shrink-0', i === step ? 'foil text-white' : 'bg-white text-ink')}>{i + 1}</span>
                    <span className="font-heading text-[18px] font-black tight">{x.title}</span>
                  </div>
                  {i === step && <p className="text-[14.5px] text-ink-2 leading-snug mt-2.5 pl-10">{x.text}</p>}
                </button>
              </li>
            ))}
          </ol>
          <div className="rounded-[24px] bg-ink text-white p-3 md:p-4 lg:sticky lg:top-[120px]">
            <div className="flex items-center justify-between gap-3 px-1 pt-1">
              <div className="text-[14px] font-semibold">{lead ? `${lead.coin} · ${m.tf.toUpperCase()} · live` : 'Its drawing'}</div>
              <span className="text-[12px] text-[#8A8A92]">Step {step + 1} of 4</span>
            </div>
            <div className="mt-2.5 rounded-[16px] bg-[#0E0E10] border border-white/[0.05] p-2">
              {lead ? <AgentDrawing coin={lead.coin} tf={m.tf} size="stage" focus={step === 1 ? focusOf(lead) : null} className="aspect-[1/1] sm:aspect-[16/10]" /> : <div className="aspect-[16/10] rounded-[12px] bg-white/[0.04] animate-pulse" />}
            </div>
            <div key={step} className="mt-3 flex gap-2.5 px-1 pb-1 animate-[rise_.35s_ease-out]">
              <Mark size={26} className="shrink-0" />
              <p className="text-[14px] text-[#E6E6E3] leading-snug">{m.look}</p>
            </div>
          </div>
        </div>
      </section>

      {/* agents checking agents */}
      <section className="mt-8 md:mt-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Who does what</div>
        <h2 className="font-heading text-[26px] md:text-[32px] font-black tight mt-1">Agents check agents, the chain checks both</h2>
        <ol className="mt-5 grid md:grid-cols-4 gap-3">
          {PIPELINE.map((p, i) => (
            <li key={p.who} className={cx('rounded-[22px] p-4 relative', i < 2 ? 'bg-ink text-white' : 'border border-line bg-white')}>
              <div className="flex items-center gap-2.5">
                {p.actor ? <Avatar actor={p.actor} size={34} /> : <span className={cx('w-[34px] h-[34px] rounded-[10px] grid place-items-center font-heading font-black text-[13px]', i === 2 ? 'foil text-white' : 'bg-ink text-white')}>{i === 2 ? 'V' : 'R'}</span>}
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight">{p.who}</div>
                  <div className={cx('text-[12px]', i < 2 ? 'text-[#8A8A92]' : 'text-ink-3')}>{p.role}</div>
                </div>
              </div>
              <p className={cx('text-[13.5px] leading-snug mt-3', i < 2 ? 'text-[#C9C9CF]' : 'text-ink-2')}>{p.text}</p>
              {i < PIPELINE.length - 1 && (
                <span className="hidden md:grid absolute -right-[14px] top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-line place-items-center z-10">
                  <IconChevron size={13} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* right now */}
      <section className="mt-8 md:mt-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Right now</div>
        <h2 className="font-heading text-[26px] md:text-[32px] font-black tight mt-1">Its live checks, coin by coin</h2>
        <p className="text-[14px] text-ink-3 mt-1">All six have to pass before it trades. Closest to a trade first.</p>
        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-1">
          {reads.map(r => {
            const on = r.coin === now?.coin
            const passed = (r.checks ?? []).filter(c => c.ok).length
            return (
              <button
                key={r.coin}
                type="button"
                onClick={() => setPick(r.coin)}
                aria-pressed={on}
                className={cx('shrink-0 h-10 pl-1.5 pr-3 rounded-full flex items-center gap-2 text-[13.5px] font-semibold press border', on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-line hover:border-ink-3')}
              >
                <CoinIcon coin={{ symbol: r.coin, icon: coinBySymbol(r.coin)?.icon }} size={26} />
                {r.coin}
                <span className={cx('num text-[11.5px]', on ? 'text-white/60' : 'text-ink-3')}>{passed}/6</span>
              </button>
            )
          })}
        </div>
        {now ? (
          <div key={now.coin} className="mt-3 rounded-[22px] border border-line p-4 md:p-5 animate-[rise_.3s_ease-out]">
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-[22px] font-black tight">{now.coin}</span>
              <button onClick={() => setShot(shot === now.coin ? null : now.coin)} className="text-[12.5px] font-semibold text-ink-3 hover:text-ink">
                {shot === now.coin ? 'Hide the chart' : 'The exact chart it read'}
              </button>
            </div>
            <p className="text-[14px] text-ink-2 leading-snug mt-1 mb-4">{voice(now)}</p>
            <Checklist r={now} dark={false} />
            {shot === now.coin && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/near/chart/${now.coin}`} alt={`ParallaxPay's ${now.coin} chart`} className="mt-4 w-full rounded-[14px]" />
            )}
          </div>
        ) : (
          <div className="mt-3 h-[360px] rounded-[22px] bg-paper-2 animate-pulse" />
        )}
      </section>

      {/* risk */}
      <section className="mt-8 md:mt-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Risk</div>
        <h2 className="font-heading text-[26px] md:text-[32px] font-black tight mt-1">How it keeps a loss small</h2>
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          {RISK.map(([t, d]) => (
            <div key={t} className="rounded-[20px] bg-paper-2 p-5">
              <div className="font-semibold text-[15.5px]">{t}</div>
              <p className="text-[14px] text-ink-2 leading-snug mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 md:mt-12 grid lg:grid-cols-2 gap-4">
        <div className="rounded-[22px] border border-line p-5 md:p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-3">Its record</div>
          <StatStrip agent={agent} />
          <p className="text-[13.5px] text-ink-3 leading-snug mt-4">It can lose. It buys dips at support, so in a falling market it mostly waits, and when support breaks the stop takes the loss. Every plan is sealed before the trade and stays on the record.</p>
        </div>
        <div className="rounded-[22px] bg-paper-2 p-5 md:p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="font-heading text-[22px] font-black tight">Give it a mandate</div>
            <p className="text-[14px] text-ink-2 leading-snug mt-1">How much, how often, which coins, ask first or autopilot. The vault on NEAR enforces it; you can revoke it in one tap.</p>
          </div>
          <div className="max-w-[320px]">{cta}</div>
        </div>
      </section>
      <p className="text-[12px] text-ink-3 mt-8">{AGENTS.parallaxpay.name} is not financial advice. It can lose money, and its record shows every loss.</p>
    </div>
  )
}
