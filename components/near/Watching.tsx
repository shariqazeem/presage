'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Sheet } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { px } from '@/lib/near/drawing'
import type { AgentState, CoinRead } from '@/lib/near/hooks'
import { ranked } from '@/lib/near/rank'
import { wouldDo, type WouldDo } from '@/lib/near/watch'
import { STYLE_NAMES, STYLE_SHARE, allowsCoin, coinsInWords, type Member, type Rules } from '@/lib/near/vault'
import { AgentDrawing } from './AgentDrawing'
import { Ask } from './Ask'
import { Heartbeat, SectionTitle, Watch } from './Desk'
import { FundFlow } from './Funding'
import { usd } from './kit'
import { MandateCard } from './Mandate'
import { focusOf, voice } from './Stage'

/**
 * Hired, not funded yet: the agent already works on your mandate and shows what it would do for you
 * right now, from the same reads and the same sizing it uses for real trades. Funding makes it real.
 */

const lowestGrade = (style: number) => Math.min(...Object.keys(STYLE_SHARE[style] ?? { 5: 1 }).map(Number))

/** What it would do for this mandate this minute, in its own words, on its chart. */
export function WouldDoCard({ rules, reads, onFund, fundLabel = 'Fund it so I can act', className = '' }: { rules: Rules; reads: CoinRead[]; onFund?: () => void; fundLabel?: string; className?: string }) {
  const d: WouldDo = wouldDo(rules, reads)
  if (d.kind === 'none') return null
  const r = d.read
  const style = STYLE_NAMES[rules.style] ?? 'balanced'
  const said =
    d.kind === 'buy'
      ? `I'd buy ${usd(d.usd, { trim: true })} of ${r.coin} now, near ${px(r.price)}. If I'm wrong I'm out at ${px(r.setup!.stop)}; I'm aiming for ${px(r.setup!.target)}.`
      : d.kind === 'pass'
        ? `${r.coin} has a setup, graded ${d.grade}/5. Your ${style} style waits for ${lowestGrade(rules.style)}/5 or better, so I'd let this one pass.`
        : `Nothing to buy for you yet. ${voice(r)}`
  return (
    <section className={cx('rounded-[24px] bg-ink text-white overflow-hidden relative', className)}>
      <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
      <div className="flex items-start gap-3 px-4 pt-4">
        <Mark size={32} className="shrink-0" />
        <div className="rounded-[16px] rounded-tl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-[14.5px] leading-snug text-[#F4F4F2]">{said}</div>
      </div>
      <div className="px-2 pt-2">
        <AgentDrawing
          coin={r.coin}
          tf="1h"
          size="card"
          {...(d.kind === 'buy' && r.setup ? { plan: { entry: r.price, stop: r.setup.stop, target: r.setup.target } } : { focus: focusOf(r) })}
          className="aspect-[16/9]"
          label={d.kind === 'buy' ? `The ${r.coin} trade ParallaxPay would take for you, with its stop and target` : `ParallaxPay's drawing of ${r.coin}`}
        />
      </div>
      {d.kind === 'wait' && d.missing.length > 0 && (
        <div className="px-4 pt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[#8A8A92] mr-0.5">Still needs</span>
          {d.missing.slice(0, 3).map(m => (
            <span key={m} className="rounded-full bg-white/[0.08] px-2.5 h-[24px] inline-flex items-center text-[12px] text-[#C9C9CF]">
              {m}
            </span>
          ))}
        </div>
      )}
      {onFund && (
        <div className="px-4 pb-4 pt-3">
          <button onClick={onFund} className="w-full h-12 rounded-[14px] bg-white text-ink font-semibold press">
            {d.kind === 'buy' ? `Fund it and I'll take trades like this` : fundLabel}
          </button>
        </div>
      )}
      {!onFund && <div className="h-4" />}
    </section>
  )
}

/** Your agent before it's funded: watching for you, saying what it would do, one tap from real. */
export function WatchDesk({ rules, agent, member, onFunded }: { rules: Rules; agent: AgentState | undefined; member: Member | null; onFunded: () => void }) {
  const [fund, setFund] = useState(false)
  const reads = agent?.reads ?? []
  const ok = ranked(reads.filter(r => allowsCoin(rules, r.token)))
  const watching = rules.coins.length && rules.coins.length <= 4 ? coinsInWords(rules.coins) : `${ok.length} coins`
  // The coin in "Right now for you" isn't repeated underneath.
  const lead = wouldDo(rules, reads)
  const others = ok.filter(r => lead.kind === 'none' || r.coin !== lead.read.coin).slice(0, 4)

  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-7 pb-28 md:pb-12">
      <section className="rounded-[28px] bg-ink text-white relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="flex items-center gap-3 px-4 md:px-6 pt-4 md:pt-5">
          <div className="relative shrink-0">
            <span className="absolute -inset-1 rounded-[14px] foil opacity-40 blur-[6px] animate-[soft-pulse_2.4s_ease-in-out_infinite]" />
            <span className="relative block">
              <Mark size={40} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-tight">Your ParallaxPay</div>
            <div className="text-[12.5px] text-[#A1A1AA] mt-0.5 truncate">
              Watching {watching} for you · {rules.autopilot ? 'autopilot' : 'asks first'}
            </div>
          </div>
          <Heartbeat at={agent?.nextCheckAt} />
        </div>
        <div className="px-4 md:px-6 pt-5 pb-5 flex flex-col md:flex-row md:items-end gap-4 md:gap-8">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-[#8A8A92]">Hired, not funded yet</div>
            <div className="font-heading text-[28px] md:text-[34px] font-black tight leading-[1.08] mt-1.5">It&rsquo;s working on your mandate. Fund it and it can act.</div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 md:w-[320px] shrink-0">
            <button onClick={() => setFund(true)} className="h-11 rounded-full bg-white text-ink text-[14px] font-semibold press">
              Fund it
            </button>
            <Link href="/start?edit=1" className="h-11 px-4 rounded-full bg-white/10 text-white text-[14px] font-semibold press grid place-items-center">
              Edit
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-5 grid lg:grid-cols-[minmax(0,1fr)_370px] gap-5 items-start">
        <div className="grid gap-6 min-w-0">
          <section>
            <SectionTitle eyebrow="Right now for you" title="What it would do with your mandate" />
            <div className="mt-3">
              <WouldDoCard rules={rules} reads={reads} onFund={() => setFund(true)} />
            </div>
          </section>
          {others.length > 0 && (
            <section>
              <SectionTitle eyebrow="Watching for you" title={rules.coins.length ? 'Your other coins' : `Next closest of ${ok.length}`} />
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {others.map(r => (
                  <Watch key={r.coin} r={r} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="grid gap-4 min-w-0 lg:sticky lg:top-[120px]">
          <MandateCard rules={rules} state="draft" compact footer={<Link href="/start?edit=1" className="h-8 px-3 rounded-full bg-paper-2 text-[12.5px] font-semibold press grid place-items-center">Edit</Link>} />
          <div className="rounded-[22px] border border-line p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Talk to it</div>
            <div className="font-heading text-[18px] font-black tight mt-0.5 mb-3">Ask your agent anything</div>
            <Ask dark={false} coin={lead.kind === 'none' ? undefined : lead.read.coin} />
          </div>
        </aside>
      </div>

      <Sheet open={fund} onClose={() => setFund(false)} title={member ? 'Add funds' : 'Fund your agent'}>
        <p className={cx('text-[14px] text-ink-2 leading-snug -mt-1 mb-4')}>{member ? 'USDC moves into your account in the vault. Withdraw it whenever you like.' : 'Sign your mandate on NEAR and move USDC into your own account in the vault. It trades from there, inside your mandate, and you can withdraw any time.'}</p>
        <FundFlow
          rules={rules}
          member={member}
          vaultLive={agent?.vault != null}
          onDone={() => {
            setFund(false)
            onFunded()
          }}
        />
      </Sheet>
    </div>
  )
}
