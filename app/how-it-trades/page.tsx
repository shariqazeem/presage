'use client'

import { useState } from 'react'
import { ActionButton, Eyebrow, Panel } from '@/components/kit'
import { AGENTS, Avatar, Checklist, StatStrip } from '@/components/near/agent'
import { NearButton } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { cx } from '@/components/ui'
import { useAgentState } from '@/lib/near/hooks'

const METHOD = [
  {
    title: 'Find the real level',
    text: 'It maps support on four timeframes: horizontal shelves, rising trendlines, the floor of a narrowing pattern. A level only the 15-minute chart can see doesn’t count; it has to show up on a higher timeframe too.',
  },
  {
    title: 'Be at it, not near it',
    text: 'It buys only with price sitting on that support. Halfway up the range, the honest stop is far below, so it waits for the retest instead.',
  },
  {
    title: 'Wait for momentum to bottom',
    text: 'Money Flow Index has to be at the bottom of its own range: 15-minute MFI at 20 or less, or hourly at 25 or less, in the lowest 15% of its recent readings. Rising MFI is the move already happening, not a buy.',
  },
  {
    title: 'Check the bigger picture',
    text: 'The daily and 4-hour structure must be building, not breaking, and the daily trend not falling. A clean 15-minute setup inside a collapsing daily chart is a pass.',
  },
]

const RISK = [
  ['A stop just under the level', 'If the support it bought breaks, the plan was wrong, so the stop sits right below it. Losses stay small by design.'],
  ['Targets from the chart', 'It sells at the pattern’s own resistance. At the first resistance it sells only if the move is tiring there; otherwise it holds for the second.'],
  ['Room to win', 'A setup needs at least twice the risk in reward, or it isn’t taken.'],
  ['Your limits on top', 'Your largest buy, buys per day and coins are enforced by the vault on NEAR, whatever the agent thinks.'],
]

/** How ParallaxPay decides, in its own terms, with today's live checklist for each coin. */
export default function HowItTrades() {
  const { accountId } = useNear()
  const { data: agent } = useAgentState()
  const [shot, setShot] = useState<string | null>(null)
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
      <div className="flex items-center gap-4">
        <Avatar actor="parallaxpay" size={56} />
        <div>
          <Eyebrow>How it trades</Eyebrow>
          <h1 className="font-heading text-[34px] md:text-[50px] leading-[1.02] font-black tight mt-1">It reads the chart like a trader</h1>
        </div>
      </div>
      <p className="text-[17px] md:text-[19px] text-ink-2 leading-snug mt-5 max-w-[720px]">
        ParallaxPay’s trading method comes from its creator’s own rules: buy where support is real and momentum is spent, put the stop right under it, sell where the pattern says the move should end. It runs the same checklist on NEAR, Zcash, Rhea and Aurora every 15 minutes.
      </p>

      <div className="grid md:grid-cols-2 gap-3 mt-8">
        {METHOD.map((m, i) => (
          <Panel key={m.title} className="p-5">
            <span className="num text-[12px] text-ink-3">0{i + 1}</span>
            <div className="font-heading text-[19px] font-black tight mt-1">{m.title}</div>
            <p className="text-[14.5px] text-ink-2 leading-snug mt-1.5">{m.text}</p>
          </Panel>
        ))}
      </div>

      <h2 className="font-heading text-[24px] md:text-[28px] font-black tight mt-12">Right now</h2>
      <p className="text-[14px] text-ink-3 mt-1">Its live checklist on each coin. All six have to pass before it trades.</p>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {(agent?.reads ?? []).map(r => (
          <Panel key={r.coin} className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-[22px] font-black tight">{r.coin}</span>
              <button onClick={() => setShot(r.coin)} className="text-[12.5px] text-ink-3 underline decoration-line underline-offset-2">
                The chart it read
              </button>
            </div>
            <p className="text-[14px] text-ink-2 leading-snug mt-1 mb-4">{r.line}</p>
            <Checklist r={r} dark={false} />
            {shot === r.coin && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/near/chart/${r.coin}`} alt={`ParallaxPay's ${r.coin} chart`} className="mt-4 w-full rounded-[12px] border border-line" />
            )}
          </Panel>
        ))}
        {!agent && [0, 1].map(i => <div key={i} className="h-[360px] rounded-[18px] bg-paper-2 animate-pulse" />)}
      </div>

      <h2 className="font-heading text-[24px] md:text-[28px] font-black tight mt-12">How it limits a loss</h2>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {RISK.map(([t, d]) => (
          <div key={t} className="rounded-[18px] bg-paper-2 p-5">
            <div className="font-semibold text-[15.5px]">{t}</div>
            <p className="text-[14px] text-ink-2 leading-snug mt-1">{d}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4 mt-12">
        <Panel tone="ticket" className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <Avatar actor="analyst" size={44} />
            <div>
              <div className="font-semibold">{AGENTS.analyst.name}</div>
              <div className="text-[12px] text-[#8A8A92]">{AGENTS.analyst.role}</div>
            </div>
          </div>
          <p className="text-[14.5px] text-[#E6E6E3] leading-snug mt-4">
            When the rules find a setup, an open model on NEAR AI Cloud reads the same four-timeframe chart against the same rubric. It can pass or lower the grade, never raise it. It runs inside a TEE, and the enclave signs every answer, so each receipt can prove what it said.
          </p>
        </Panel>
        <Panel className="p-5 md:p-6">
          <div className="label text-ink-3 mb-3">Its record</div>
          <StatStrip agent={agent} />
          <p className="text-[13.5px] text-ink-3 leading-snug mt-4">It can lose. It buys dips at support, so in a falling market it mostly waits, and when support breaks the stop takes the loss. Every plan is sealed before the trade and stays on the record.</p>
        </Panel>
      </div>

      <div className={cx('mt-10 max-w-[420px]')}>{accountId ? <ActionButton href="/start">Get started</ActionButton> : <NearButton variant="full" label="Get started" />}</div>
    </div>
  )
}
