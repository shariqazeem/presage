'use client'

import type { ReactNode } from 'react'
import { cx } from '../ui'
import { COINS, USDC } from '@/lib/near/config'
import { fromUnits, toUnits } from '@/lib/near/units'
import type { Rules } from '@/lib/near/vault'

export const STYLES = [
  { id: 0, name: 'Calm', line: 'Only its best setups. Fewer trades, the cleanest charts.' },
  { id: 1, name: 'Balanced', line: 'Its best setups and strong ones, sized down a little.' },
  { id: 2, name: 'Bold', line: 'Takes good setups too, at half size. More trades, more noise.' },
] as const

const SIZES = [5, 10, 25, 50, 100]
const PER_DAY = [1, 2, 3, 5]

export const defaultRules = (): Rules => ({ autopilot: false, max_trade: toUnits(10, USDC.decimals).toString(), trades_per_day: 2, coins: [COINS[0].id], style: 1 })

function Choice({ on, onClick, children, className = '' }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx('rounded-[14px] border text-left transition-all', on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink-3', className)}>
      {children}
    </button>
  )
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="py-5 border-t border-line first:border-t-0 first:pt-0">
      <h3 className="font-heading text-[17px] font-black tight">{title}</h3>
      {sub && <p className="text-[13.5px] text-ink-3 mt-0.5">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Everything a member decides about their agent. Every field ends up in the vault on NEAR. */
export function RulesForm({ rules, onChange }: { rules: Rules; onChange: (r: Rules) => void }) {
  const set = (patch: Partial<Rules>) => onChange({ ...rules, ...patch })
  const size = fromUnits(rules.max_trade, USDC.decimals)
  return (
    <div>
      <Section title="How it runs" sub="You can switch any time, and stop it with one tap.">
        <div className="grid grid-cols-2 gap-2.5">
          <Choice on={!rules.autopilot} onClick={() => set({ autopilot: false })} className="p-4">
            <div className="font-semibold text-[15px]">Ask first</div>
            <div className={cx('text-[13px] mt-1 leading-snug', !rules.autopilot ? 'text-white/70' : 'text-ink-3')}>It proposes each trade. You approve it from your wallet.</div>
          </Choice>
          <Choice on={rules.autopilot} onClick={() => set({ autopilot: true })} className="p-4">
            <div className="font-semibold text-[15px]">Autopilot</div>
            <div className={cx('text-[13px] mt-1 leading-snug', rules.autopilot ? 'text-white/70' : 'text-ink-3')}>It trades on its own, inside the limits below.</div>
          </Choice>
        </div>
      </Section>
      <Section title="Style" sub="How picky it is before it buys.">
        <div className="grid gap-2">
          {STYLES.map(s => (
            <Choice key={s.id} on={rules.style === s.id} onClick={() => set({ style: s.id })} className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="font-semibold text-[15px]">{s.name}</span>
              <span className={cx('text-[13px] text-right', rules.style === s.id ? 'text-white/70' : 'text-ink-3')}>{s.line}</span>
            </Choice>
          ))}
        </div>
      </Section>
      <Section title="Coins" sub="What it may buy for you. It always comes back to USDC.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COINS.map(c => {
            const on = rules.coins.includes(c.id)
            return (
              <Choice key={c.id} on={on} onClick={() => set({ coins: on ? rules.coins.filter(x => x !== c.id) : [...rules.coins, c.id] })} className="px-4 py-3">
                <div className="font-semibold text-[15px]">{c.symbol}</div>
                <div className={cx('text-[12.5px]', on ? 'text-white/70' : 'text-ink-3')}>{c.name}</div>
              </Choice>
            )
          })}
        </div>
      </Section>
      <Section title="Largest buy" sub="The most it spends on one trade, in USDC.">
        <div className="flex flex-wrap gap-2">
          {SIZES.map(v => (
            <Choice key={v} on={size === v} onClick={() => set({ max_trade: toUnits(v, USDC.decimals).toString() })} className="px-4 h-11 num text-[15px] grid place-items-center">
              ${v}
            </Choice>
          ))}
        </div>
      </Section>
      <Section title="Buys a day" sub="Selling back to USDC is never limited, so it can always get out.">
        <div className="flex flex-wrap gap-2">
          {PER_DAY.map(v => (
            <Choice key={v} on={rules.trades_per_day === v} onClick={() => set({ trades_per_day: v })} className="px-4 h-11 num text-[15px] grid place-items-center">
              {v}
            </Choice>
          ))}
        </div>
      </Section>
    </div>
  )
}

export function rulesSummary(r: Rules): string {
  const coins = r.coins.map(id => COINS.find(c => c.id === id)?.symbol ?? id).join(' and ') || 'no coins'
  return `${r.autopilot ? 'Autopilot' : 'Ask first'} · ${STYLES[r.style]?.name ?? 'Balanced'} · ${coins} · up to $${fromUnits(r.max_trade, USDC.decimals)} a buy, ${r.trades_per_day} a day`
}
