'use client'

import Link from 'next/link'
import { useNow } from '../kit'
import { cx } from '../ui'
import { px } from '@/lib/near/drawing'
import { useAgentState, usePresence } from '@/lib/near/hooks'

/**
 * The agent's status strip under the desktop bar: what ParallaxPay is doing, when it reads next, and
 * how close each coin it watches is to a trade (its six checks), with the price alongside.
 */
export function Ticker() {
  const { data } = useAgentState()
  const { data: here } = usePresence()
  const now = useNow(1000)
  const left = data ? Math.max(0, data.nextCheckAt - now) : null
  const setups = data?.reads.filter(r => r.setup).length ?? 0
  return (
    <div className="border-t border-line bg-paper-2/60">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-8 h-9 flex items-center gap-6 text-[12.5px] overflow-x-auto no-scrollbar">
        <span className="flex items-center gap-2 shrink-0 text-ink-2">
          <span className={cx('w-1.5 h-1.5 rounded-full', setups ? 'foil' : 'bg-up', 'animate-[soft-pulse_2s_ease-in-out_infinite]')} />
          <span className="font-semibold text-ink">ParallaxPay</span>
          {setups ? `found ${setups} setup${setups === 1 ? '' : 's'}` : 'is reading the market'}
          {left != null && <span className="num text-ink-3">· {left === 0 ? 'reading now' : `next read ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>}
        </span>
        {(data?.reads ?? []).map(r => {
          const checks = r.checks ?? []
          return (
            <Link key={r.coin} href={`/?coin=${r.coin}#live`} className="flex items-center gap-2 shrink-0 press hover:text-ink" title={`${checks.filter(c => c.ok).length} of ${checks.length} checks pass`}>
              <span className="font-semibold text-ink">{r.coin}</span>
              <span className="flex gap-[2px]" aria-hidden>
                {checks.map(c => (
                  <span key={c.key} className={cx('w-[5px] h-[9px] rounded-[1.5px]', c.ok ? (r.setup ? 'foil' : 'bg-up') : 'bg-ink/[0.12]')} />
                ))}
              </span>
              <span className="num text-ink-3">{px(r.price)}</span>
            </Link>
          )
        })}
        {here ? <span className="ml-auto shrink-0 text-ink-3">{here} {here === 1 ? 'person' : 'people'} here</span> : null}
      </div>
    </div>
  )
}
