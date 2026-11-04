'use client'

import Link from 'next/link'
import { useNow } from '../kit'
import { money } from '../near/kit'
import { LivePrice } from '../near/motion'
import { cx } from '../ui'
import { useAgentState } from '@/lib/near/hooks'

/** The exchange-style strip under the desktop bar: every coin the agent watches, live, and what it's doing. */
export function Ticker() {
  const { data } = useAgentState()
  const now = useNow(1000)
  const left = data ? Math.max(0, data.nextCheckAt - now) : null
  const setups = data?.reads.filter(r => r.setup).length ?? 0
  return (
    <div className="border-t border-line bg-paper-2/60">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-8 h-9 flex items-center gap-6 text-[12.5px] overflow-x-auto no-scrollbar">
        <span className="flex items-center gap-2 shrink-0 text-ink-2">
          <span className={cx('w-1.5 h-1.5 rounded-full', setups ? 'foil' : 'bg-up', 'animate-[soft-pulse_2s_ease-in-out_infinite]')} />
          <span className="font-semibold text-ink">ParallaxPay</span>
          {setups ? `${setups} setup${setups === 1 ? '' : 's'} live` : 'watching'}
          {left != null && (
            <span className="num text-ink-3">
              · next read {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
          )}
        </span>
        {(data?.reads ?? []).map(r => (
          <Link key={r.coin} href={`/?coin=${r.coin}#live`} className="flex items-center gap-1.5 shrink-0 press hover:text-ink">
            <span className="font-semibold text-ink">{r.coin}</span>
            <LivePrice value={r.price} format={money} className="text-ink-2" />
            {r.change24h != null && <span className={cx('num', r.change24h >= 0 ? 'text-up' : 'text-down')}>{`${r.change24h >= 0 ? '+' : '−'}${Math.abs(r.change24h * 100).toFixed(1)}%`}</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}
