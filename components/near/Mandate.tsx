'use client'

import type { ReactNode } from 'react'
import { IconCheck } from '../icons'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { COINS, USDC } from '@/lib/near/config'
import { fromUnits } from '@/lib/near/units'
import type { Rules } from '@/lib/near/vault'
import { STYLES } from './RulesForm'
import { usd } from './kit'

/**
 * A mandate: what a person allows ParallaxPay to do with their account. Not a settings form but the
 * agreement itself, the way the vault on NEAR enforces it. A draft is still being written; a signed
 * one is in force on NEAR.
 */

export type MandateState = 'draft' | 'signed'

export function mandateLines(r: Rules): { k: string; v: string }[] {
  const coins = r.coins.map(id => COINS.find(c => c.id === id)?.symbol ?? id)
  return [
    { k: 'Trades', v: coins.length ? coins.join(', ') : 'No coins yet' },
    { k: 'Each buy', v: `Up to ${usd(fromUnits(r.max_trade, USDC.decimals), { trim: true })}` },
    { k: 'Per day', v: `At most ${r.trades_per_day} buy${r.trades_per_day === 1 ? '' : 's'}` },
    { k: 'Style', v: `${STYLES[r.style]?.name ?? 'Balanced'}: ${['only its best setups', 'its best and strong setups', 'good setups too, at half size'][r.style] ?? ''}` },
    { k: 'Decides', v: r.autopilot ? 'On its own, inside these limits' : 'Asks you before every trade' },
  ]
}

export function MandateCard({
  rules,
  state = 'draft',
  signer,
  footer,
  compact = false,
  className = '',
}: {
  rules: Rules
  state?: MandateState
  signer?: string | null
  footer?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cx('rounded-[22px] bg-white border border-line relative overflow-hidden', className)}>
      <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
      <div className={cx('flex items-center gap-3', compact ? 'px-4 pt-4' : 'px-5 pt-5')}>
        <Mark size={compact ? 32 : 36} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Mandate</div>
          <div className="font-heading text-[18px] font-black tight leading-tight">ParallaxPay may</div>
        </div>
        <span className={cx('rounded-full px-2.5 h-[24px] inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.07em]', state === 'signed' ? (rules.autopilot ? 'foil text-white' : 'bg-ink text-white') : 'bg-paper-2 text-ink-3')}>
          {state === 'signed' ? (rules.autopilot ? 'Autopilot' : 'Asks first') : 'Draft'}
        </span>
      </div>
      <dl className={cx('grid gap-2.5', compact ? 'px-4 pt-3 pb-3' : 'px-5 pt-4 pb-4')}>
        {mandateLines(rules).map(l => (
          <div key={l.k} className="grid grid-cols-[84px_1fr] gap-3 items-baseline">
            <dt className="text-[12.5px] text-ink-3">{l.k}</dt>
            <dd className="text-[14px] text-ink leading-snug">{l.v}</dd>
          </div>
        ))}
      </dl>
      <div className={cx('border-t border-dashed border-line flex items-center gap-2.5', compact ? 'px-4 py-3' : 'px-5 py-3.5')}>
        {state === 'signed' ? (
          <>
            <span className="w-6 h-6 rounded-full foil grid place-items-center text-white shrink-0">
              <IconCheck size={12} weight={3} />
            </span>
            <div className="min-w-0 text-[12.5px] leading-snug">
              <div className="font-semibold text-ink truncate">Signed by {signer ?? 'you'}</div>
              <div className="text-ink-3">Enforced by the vault on NEAR. Revoke any time.</div>
            </div>
          </>
        ) : (
          <div className="text-[12.5px] text-ink-3 leading-snug">Signed with your NEAR wallet, then enforced by the vault on NEAR. Revoke any time.</div>
        )}
        {footer && <div className="ml-auto shrink-0">{footer}</div>}
      </div>
    </div>
  )
}
