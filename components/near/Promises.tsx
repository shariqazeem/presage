'use client'

import Link from 'next/link'
import { IconChevron, IconLock } from '../icons'
import { useNow } from '../kit'
import { cx } from '../ui'
import { useTrades } from '@/lib/near/hooks'
import type { PositionView } from '@/lib/near/store'
import { ago, usd } from './kit'

/**
 * Its promises: every plan ParallaxPay sealed on NEAR before trading, newest first. A sealed plan's
 * contents stay hidden until it is opened after the trade; wins and losses are shown the same way.
 */

function word(t: PositionView): { text: string; tone: 'sealed' | 'open' | 'win' | 'loss' | 'quiet' } {
  if (t.status === 'closed') return (t.pnlUsd ?? 0) >= 0 ? { text: 'Kept · up', tone: 'win' } : { text: 'Kept · down', tone: 'loss' }
  if (t.status === 'open') return { text: 'Trading', tone: 'open' }
  if (t.status === 'not_filled') return { text: 'Didn’t fill', tone: 'quiet' }
  if (t.status === 'declined') return { text: 'Not taken', tone: 'quiet' }
  return { text: 'Sealed', tone: 'sealed' }
}

export function Ticket({ t, now }: { t: PositionView; now: number }) {
  const w = word(t)
  return (
    <Link href={`/record/${t.id}`} className="flex items-center gap-3 rounded-[18px] border border-line bg-white px-3.5 py-3 press hover:border-ink-3">
      <span className={cx('w-10 h-10 rounded-full grid place-items-center shrink-0 text-white', t.opened ? 'bg-ink' : 'foil')}>
        <IconLock size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[15px]">{t.coin}</span>
          <span
            className={cx(
              'rounded-full px-2 h-[20px] inline-flex items-center text-[10.5px] font-semibold uppercase tracking-[0.07em]',
              w.tone === 'sealed' && 'foil text-white',
              w.tone === 'open' && 'bg-ink text-white',
              w.tone === 'win' && 'bg-up/10 text-up',
              w.tone === 'loss' && 'bg-down/10 text-down',
              w.tone === 'quiet' && 'bg-paper-2 text-ink-3',
            )}
          >
            {w.text}
          </span>
        </div>
        <div className="num text-[12px] text-ink-3 truncate mt-0.5">
          {t.hash.slice(0, 10)}… · sealed {ago(t.createdAt, now)}
        </div>
      </div>
      <div className="text-right shrink-0">
        {t.status === 'closed' && t.pnlUsd != null ? (
          <div className={cx('num text-[14px] font-semibold', t.pnlUsd >= 0 ? 'text-up' : 'text-down')}>{usd(t.pnlUsd, { sign: true })}</div>
        ) : (
          <div className="text-[12px] text-ink-3 leading-tight max-w-[96px]">{t.opened ? 'opened on NEAR' : 'opens after the trade'}</div>
        )}
      </div>
    </Link>
  )
}

export function Promises({ max = 3 }: { max?: number }) {
  const { data } = useTrades()
  const now = useNow(30_000)
  const trades = data?.trades ?? []
  const stats = data?.stats
  return (
    <div className="rounded-[22px] border border-line p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Its promises</div>
          <div className="font-heading text-[18px] font-black tight mt-0.5">Sealed before every trade</div>
        </div>
        <Link href="/record" className="text-[13px] font-semibold flex items-center gap-0.5 shrink-0">
          All <IconChevron size={13} />
        </Link>
      </div>
      {trades.length ? (
        <>
          {stats && stats.closed > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-[14px] bg-paper-2 px-3 py-2.5">
              <div>
                <div className="num text-[16px] font-semibold">{stats.closed}</div>
                <div className="text-[11.5px] text-ink-3">kept</div>
              </div>
              <div>
                <div className="num text-[16px] font-semibold">{Math.round((stats.wins / stats.closed) * 100)}%</div>
                <div className="text-[11.5px] text-ink-3">ended up</div>
              </div>
              <div>
                <div className={cx('num text-[16px] font-semibold', stats.pnlUsd > 0 && 'text-up', stats.pnlUsd < 0 && 'text-down')}>{usd(stats.pnlUsd, { sign: true })}</div>
                <div className="text-[11.5px] text-ink-3">made</div>
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {trades.slice(0, max).map(t => (
              <Ticket key={t.id} t={t} now={now} />
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-[16px] border border-dashed border-line px-4 py-4 flex items-start gap-3">
          <span className="w-9 h-9 rounded-full foil grid place-items-center text-white shrink-0">
            <IconLock size={15} />
          </span>
          <p className="text-[13.5px] text-ink-2 leading-snug">
            When ParallaxPay finds a setup, it seals the plan on NEAR first: a fingerprint of the entry, stop and target that can't be changed. After the trade it opens the plan here, win or loss.
          </p>
        </div>
      )}
    </div>
  )
}
