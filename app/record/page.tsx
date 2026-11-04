'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useNow } from '@/components/kit'
import { IconCheck, IconLock } from '@/components/icons'
import { Floor } from '@/components/near/agent'
import { AgentDrawing } from '@/components/near/AgentDrawing'
import { ago, usd } from '@/components/near/kit'
import { Segmented } from '@/components/near/primitives'
import { focusOf } from '@/components/near/Stage'
import { cx } from '@/components/ui'
import { tfForAge } from '@/lib/near/drawing'
import { useAgentState, useTrades } from '@/lib/near/hooks'
import { previewDesk } from '@/lib/near/preview'
import type { PositionView } from '@/lib/near/store'

type Filter = 'all' | 'live' | 'kept'

function state(t: PositionView): { word: string; tone: 'sealed' | 'open' | 'up' | 'down' | 'quiet' } {
  if (t.status === 'closed') return (t.pnlUsd ?? 0) >= 0 ? { word: 'Kept · up', tone: 'up' } : { word: 'Kept · down', tone: 'down' }
  if (t.status === 'open') return { word: 'Trading', tone: 'open' }
  if (t.status === 'not_filled') return { word: 'Didn’t fill', tone: 'quiet' }
  if (t.status === 'declined') return { word: 'Not taken', tone: 'quiet' }
  return { word: 'Sealed', tone: 'sealed' }
}

/** One promise: the chart it was made on, its plan once opened, and how it ended. */
function PromiseCard({ t, now }: { t: PositionView; now: number }) {
  const s = state(t)
  const at = t.plan?.issuedAt ?? t.createdAt
  const plan = t.plan ? { entry: t.plan.entry.priceAtIssue, stop: t.plan.stop, target: t.plan.target, from: at } : null
  const markers = [
    ...(t.openedAt && t.entryPrice ? [{ at: t.openedAt, price: t.entryPrice, label: 'In', tone: 'in' as const }] : []),
    ...(t.closedAt && t.exitPrice && t.status === 'closed' ? [{ at: t.closedAt, price: t.exitPrice, label: 'Out', tone: 'out' as const }] : []),
  ]
  return (
    <Link href={`/record/${t.id}`} className="rounded-[22px] bg-ink text-white overflow-hidden press block relative">
      {!t.opened && <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />}
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-heading text-[17px] font-black tight">{t.coin}</span>
          <span
            className={cx(
              'rounded-full px-2 h-[20px] inline-flex items-center text-[10.5px] font-semibold uppercase tracking-[0.07em]',
              s.tone === 'sealed' && 'foil text-white',
              s.tone === 'open' && 'bg-white text-ink',
              s.tone === 'up' && 'bg-up-d/15 text-up-d',
              s.tone === 'down' && 'bg-down-d/15 text-down-d',
              s.tone === 'quiet' && 'bg-white/[0.08] text-[#A1A1AA]',
            )}
          >
            {s.word}
          </span>
        </div>
        {t.status === 'closed' && t.pnlUsd != null ? (
          <span className={cx('num text-[15px] font-semibold', t.pnlUsd >= 0 ? 'text-up-d' : 'text-down-d')}>{usd(t.pnlUsd, { sign: true })}</span>
        ) : (
          <span className="num text-[12.5px] text-[#8A8A92]">{usd(t.usdcIn, { trim: true })}</span>
        )}
      </div>
      <div className="relative px-1.5 pt-1">
        <AgentDrawing coin={t.coin} tf={tfForAge(now - at)} size="card" plan={plan} markers={markers} animate={false} className="aspect-[16/9]" label={`The ${t.coin} chart this plan was made on`} />
        {!t.opened && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-1.5 rounded-full bg-ink/85 backdrop-blur px-3 h-8 text-[12.5px] font-semibold">
              <IconLock size={13} /> Plan sealed until the trade ends
            </span>
          </div>
        )}
      </div>
      <div className="px-4 pb-3.5 pt-1 flex items-center justify-between gap-2 text-[12px] text-[#8A8A92]">
        <span className="num truncate">
          #{t.callId ?? '—'} · {t.hash.slice(0, 10)}…
        </span>
        <span className="shrink-0">sealed {ago(t.createdAt, now)}</span>
      </div>
    </Link>
  )
}

const STEPS = [
  { title: 'Sealed', text: 'Before buying, it puts a fingerprint of the plan on NEAR: coin, entry, stop, target. It can’t be changed after.' },
  { title: 'Traded', text: 'The vault trades only inside the member’s mandate, through Rhea, from their own account.' },
  { title: 'Opened', text: 'When the trade ends it publishes the plan. Anyone can check it against the fingerprint, win or loss.' },
]

/** Its work: every plan ParallaxPay sealed before trading, kept in public. */
export default function Record() {
  const { data } = useTrades()
  const { data: agent } = useAgentState()
  const now = useNow(30_000)
  const [filter, setFilter] = useState<Filter>('all')
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    // Sample promises for checking the design locally. Development builds only.
    if (process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('preview')) setPreview(true)
  }, [])
  const trades = preview ? previewDesk(agent?.reads ?? []).positions : (data?.trades ?? [])
  const s = data?.stats
  const shown = trades.filter(t => (filter === 'all' ? true : filter === 'live' ? t.status === 'proposed' || t.status === 'open' : t.status === 'closed'))
  const setups = (agent?.feed ?? []).filter(l => l.kind === 'setup' || l.kind === 'pass' || l.kind === 'seal')
  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 lg:px-8 pt-5 md:pt-9 pb-24 md:pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Its work</div>
          <h1 className="font-heading text-[30px] md:text-[44px] leading-[1.04] font-black tight mt-1">Every plan, sealed before the trade</h1>
          <p className="text-[15px] md:text-[16px] text-ink-2 mt-2.5 leading-snug max-w-[640px]">Each promise is the chart it read, the plan it fingerprinted on NEAR, and how it ended. Losses stay in. Open one to check it yourself.</p>
        </div>
        {trades.length > 0 && (
          <Segmented
            layoutId="record-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'live', label: 'Live' },
              { value: 'kept', label: 'Kept' },
            ]}
          />
        )}
      </div>

      {s && s.closed > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2.5 max-w-[560px]">
          <div className="rounded-[18px] bg-paper-2 px-4 py-3">
            <div className="num text-[24px] font-semibold">{s.closed}</div>
            <div className="text-[12.5px] text-ink-3">kept</div>
          </div>
          <div className="rounded-[18px] bg-paper-2 px-4 py-3">
            <div className="num text-[24px] font-semibold">{Math.round((s.wins / s.closed) * 100)}%</div>
            <div className="text-[12.5px] text-ink-3">ended up</div>
          </div>
          <div className="rounded-[18px] bg-paper-2 px-4 py-3">
            <div className={cx('num text-[24px] font-semibold', s.pnlUsd < 0 && 'text-down', s.pnlUsd > 0 && 'text-up')}>{usd(s.pnlUsd, { sign: true })}</div>
            <div className="text-[12.5px] text-ink-3">made, all members</div>
          </div>
        </div>
      )}

      {trades.length > 0 ? (
        shown.length ? (
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shown.map(t => (
              <PromiseCard key={t.id} t={t} now={now} />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-[14px] text-ink-3">Nothing here yet.</p>
        )
      ) : (
        <>
          <div className="mt-6 grid md:grid-cols-3 gap-3">
            {STEPS.map((st, i) => (
              <div key={st.title} className="rounded-[20px] border border-line p-4">
                <span className={cx('w-8 h-8 rounded-full grid place-items-center text-white', i === 0 ? 'foil' : 'bg-ink')}>{i === 0 ? <IconLock size={14} /> : i === 1 ? <span className="num text-[12px] font-semibold">2</span> : <IconCheck size={14} weight={3} />}</span>
                <div className="font-semibold text-[15px] mt-3">{st.title}</div>
                <p className="text-[13.5px] text-ink-2 leading-snug mt-1">{st.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
            <div className="rounded-[22px] bg-ink text-white p-4 md:p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">While the first promise is made</div>
              <div className="font-heading text-[19px] font-black tight mt-0.5">What it is reading right now</div>
              <div className="grid grid-cols-2 gap-2.5 mt-3">
                {(agent?.reads ?? []).map(r => (
                  <Link key={r.coin} href={`/?coin=${r.coin}#live`} className="rounded-[16px] bg-white/[0.04] border border-white/[0.06] p-2.5 press">
                    <div className="flex items-center justify-between px-1">
                      <span className="font-heading text-[14px] font-black tight">{r.coin}</span>
                      <span className="num text-[11.5px] text-[#8A8A92]">
                        {(r.checks ?? []).filter(c => c.ok).length}/{(r.checks ?? []).length}
                      </span>
                    </div>
                    <AgentDrawing coin={r.coin} tf="1h" size="thumb" focus={focusOf(r)} className="h-[64px] mt-1.5" />
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-[22px] border border-line p-4 md:p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Setups it found lately</div>
              <Floor lines={setups} max={6} empty="No setups yet. It only seals a plan when all of its checks agree." />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
