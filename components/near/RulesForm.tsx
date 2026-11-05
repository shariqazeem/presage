'use client'

import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { cx } from '../ui'
import { USDC } from '@/lib/near/config'
import { fromUnits, toUnits } from '@/lib/near/units'
import { MAX_COINS, coinsInWords, type Rules } from '@/lib/near/vault'
import { PerDayPicker, SizePicker } from './SizePicker'
import { CoinChooser } from './coins'
import { useAgentState } from '@/lib/near/hooks'
import { ranked } from '@/lib/near/rank'

export const STYLES = [
  { id: 0, name: 'Calm', line: 'Only its best setups. Fewer trades, the cleanest charts.' },
  { id: 1, name: 'Balanced', line: 'Its best setups and strong ones, sized down a little.' },
  { id: 2, name: 'Bold', line: 'Takes good setups too, at half size. More trades, more noise.' },
] as const

export const defaultRules = (): Rules => ({ autopilot: false, max_trade: toUnits(10, USDC.decimals).toString(), trades_per_day: 2, coins: [], style: 1 })

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
  const { data: agent } = useAgentState()
  const reads = ranked(agent?.reads ?? [])
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
        <Choice on={rules.coins.length === 0} onClick={() => set({ coins: [] })} className="w-full px-4 py-3 mb-2">
          <div className="font-semibold text-[15px]">Any coin it finds</div>
          <div className={cx('text-[12.5px]', rules.coins.length === 0 ? 'text-white/70' : 'text-ink-3')}>The best setup among every coin it can trade on Rhea</div>
        </Choice>
        <div className="text-[12.5px] text-ink-3 mt-3 mb-1">Or only these, up to {MAX_COINS}:</div>
        <CoinChooser
          reads={reads}
          chosen={rules.coins}
          max={MAX_COINS}
          onToggle={id => {
            if (rules.coins.includes(id)) set({ coins: rules.coins.filter(x => x !== id) })
            else if (rules.coins.length >= MAX_COINS) toast(`Up to ${MAX_COINS} coins, or let it pick from all of them.`)
            else set({ coins: [...rules.coins, id] })
          }}
        />
      </Section>
      <Section title="Largest buy" sub="The most it spends on one trade, in USDC. Any amount.">
        <SizePicker value={size} big={false} onChange={v => set({ max_trade: toUnits(v, USDC.decimals).toString() })} />
      </Section>
      <Section title="Buys a day" sub="Selling back to USDC is never limited, so it can always get out.">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-ink-2">At most {usdText(size * rules.trades_per_day)} a day into new trades</span>
          <PerDayPicker value={rules.trades_per_day} onChange={n => set({ trades_per_day: n })} />
        </div>
      </Section>
    </div>
  )
}

const usdText = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export function rulesSummary(r: Rules): string {
  const coins = coinsInWords(r.coins)
  return `${r.autopilot ? 'Autopilot' : 'Ask first'} · ${STYLES[r.style]?.name ?? 'Balanced'} · ${coins} · up to $${fromUnits(r.max_trade, USDC.decimals)} a buy, ${r.trades_per_day} a day`
}
