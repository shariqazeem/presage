'use client'

import Link from 'next/link'
import { Eyebrow, Panel } from '@/components/kit'
import { money, pctText } from '@/components/near/kit'
import { cx } from '@/components/ui'
import { useAgentState, useTrades } from '@/lib/near/hooks'
import { Floor } from '@/components/near/agent'

const WORD = { proposed: 'Waiting', open: 'Open', closed: 'Closed', not_filled: "Didn't fill", declined: 'Not taken' } as const

/** Every trade idea the agent acted on, for anyone to check. Plans stay sealed until they open on NEAR. */
export default function Trades() {
  const { data } = useTrades()
  const { data: agent } = useAgentState()
  const setups = (agent?.feed ?? []).filter(l => l.kind === 'setup' || l.kind === 'pass')
  const trades = data?.trades ?? []
  const s = data?.stats
  return (
    <div className="max-w-[1000px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
      <Eyebrow>The record</Eyebrow>
      <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.05] font-black tight mt-2">Every trade, sealed before it happened</h1>
      <p className="text-[16px] text-ink-2 mt-3 leading-snug max-w-[640px]">
        ParallaxPay seals each plan on NEAR before it trades and opens it afterwards. Losses stay in. Open any trade to see the chart it read and check its plan against the seal yourself.
      </p>
      <div className="grid grid-cols-3 gap-3 mt-6">
        <Panel className="p-4">
          <div className="num text-[26px] font-semibold">{s?.closed ?? 0}</div>
          <div className="text-[12.5px] text-ink-3">closed</div>
        </Panel>
        <Panel className="p-4">
          <div className="num text-[26px] font-semibold">{s?.closed ? `${Math.round((s.wins / s.closed) * 100)}%` : '—'}</div>
          <div className="text-[12.5px] text-ink-3">ended up</div>
        </Panel>
        <Panel className="p-4">
          <div className={cx('num text-[26px] font-semibold', s && s.pnlUsd < 0 && 'text-down', s && s.pnlUsd > 0 && 'text-up')}>{s?.closed ? money(s.pnlUsd, { sign: true }) : '—'}</div>
          <div className="text-[12.5px] text-ink-3">made, all members</div>
        </Panel>
      </div>
      <Panel className="mt-5 overflow-hidden">
        {trades.length === 0 ? (
          <div className="p-5 md:p-6">
            <p className="text-[14px] text-ink-2">No trades yet. The first one lands here the moment its plan is sealed.</p>
            {setups.length > 0 && (
              <>
                <div className="label text-ink-3 mt-5 mb-1">Setups it found lately</div>
                <Floor lines={setups} max={6} />
              </>
            )}
          </div>
        ) : (
          <ol className="divide-y divide-line">
            {trades.map(t => (
              <li key={t.id}>
                <Link href={`/record/${t.id}`} className="flex items-center gap-4 px-4 md:px-5 py-3.5 hover:bg-paper-2 transition-colors">
                  <span className="font-heading text-[18px] font-black tight w-14">{t.coin}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-ink truncate">
                      {money(t.usdcIn)} {t.mode === 'ask' ? 'approved by' : 'for'} <span className="num">{t.accountId}</span>
                    </div>
                    <div className="text-[12px] text-ink-3">
                      {WORD[t.status]} · plan #{t.callId ?? '—'} {t.opened ? 'opened' : 'sealed'} · {new Date((t.openedAt ?? t.createdAt) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cx('num text-[15px] font-semibold', t.pnlUsd == null ? 'text-ink-3' : t.pnlUsd >= 0 ? 'text-up' : 'text-down')}>{t.pnlUsd == null ? '—' : money(t.pnlUsd, { sign: true })}</div>
                    <div className="num text-[12px] text-ink-3">{pctText(t.pnlPct)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
