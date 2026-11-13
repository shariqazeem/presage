'use client'

import Link from 'next/link'
import { useNow } from '@/components/kit'
import { IconChevron } from '@/components/icons'
import { ago } from '@/components/near/kit'
import { shortAccount, useNear } from '@/components/near/NearWallet'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import { useBoard, useDesk, type BoardRow } from '@/lib/near/hooks'

const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`)

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <div className="text-[11px] text-ink-3">{k}</div>
      <div className={cx('num text-[15px] font-semibold mt-0.5', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{v}</div>
    </div>
  )
}

function Row({ s, rank, now }: { s: BoardRow; rank: number | null; now: number }) {
  const r = s.record
  return (
    <Link href={`/board/${s.id}`} className="min-w-0 rounded-[22px] border border-line bg-white p-4 press block hover:border-ink-3 transition-colors">
      <div className="flex items-center gap-3">
        {s.house && !rank ? (
          <Mark size={36} className="shrink-0" />
        ) : (
          <span className={cx('w-9 h-9 rounded-full grid place-items-center num text-[14px] font-semibold shrink-0', rank === 1 ? 'foil text-white' : rank ? 'bg-ink text-white' : 'bg-paper-2 text-ink-3')}>{rank ?? '·'}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-heading text-[17px] font-black tight truncate">{s.house ? 'The house method' : s.name}</span>
            {s.adopted && <span className="rounded-full foil text-white px-2 h-[20px] inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.07em] shrink-0">Adopted</span>}
            {!s.ranked && <span className="rounded-full bg-paper-2 text-ink-3 px-2 h-[20px] inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.07em] shrink-0">{s.house ? 'Default' : 'New'}</span>}
          </div>
          <div className="text-[12.5px] text-ink-3 mt-0.5 truncate">{s.house ? 'ParallaxPay’s own method' : `by ${shortAccount(s.owner)}`}</div>
        </div>
        <IconChevron size={16} className="text-ink-3 shrink-0" />
      </div>
      <div className="mt-3.5 grid grid-cols-4 gap-2">
        <Stat k="Trades" v={String(r.trades)} />
        <Stat k="Win rate" v={r.trades ? `${Math.round((r.wins / r.trades) * 100)}%` : '—'} />
        <Stat k="Per trade" v={pct(r.avgPct)} tone={r.avgPct == null ? undefined : r.avgPct >= 0 ? 'up' : 'down'} />
        <Stat k="Agents" v={String(r.members)} />
      </div>
      {(r.open > 0 || r.lastAt) && (
        <div className="mt-3 text-[12px] text-ink-3">
          {r.open > 0 ? `${r.open} trade${r.open === 1 ? '' : 's'} running` : ''}
          {r.open > 0 && r.lastAt ? ' · ' : ''}
          {r.lastAt ? `last ${ago(r.lastAt, now)}` : ''}
        </div>
      )}
    </Link>
  )
}

/** The board: strategies ranked by their real, sealed trades, and the way in for your own. */
export default function Board() {
  const { data } = useBoard()
  const { accountId } = useNear()
  const { data: desk } = useDesk(accountId)
  const now = useNow(30_000)
  const rows = data?.strategies ?? []
  let n = 0
  const ranks = rows.map(s => (s.ranked ? ++n : null))
  const member = Boolean(desk?.member)

  return (
    <div className="max-w-[860px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-28 md:pb-16">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">The board</div>
      <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.05] font-black tight mt-2" style={{ textWrap: 'balance' }}>
        Strategies, ranked by real trades.
      </h1>
      <p className="text-[15.5px] text-ink-2 mt-3 leading-snug max-w-[620px]">Every trade is sealed on NEAR before it happens and opened after. Records are public. A strategy&rsquo;s settings unlock when you hire it.</p>

      <section className="mt-6 rounded-[24px] bg-ink text-white p-5 relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="flex items-start gap-3">
          <Mark size={34} className="shrink-0" />
          <div className="min-w-0">
            <div className="font-heading text-[19px] font-black tight leading-tight">Beat the house and it adopts you.</div>
            <p className="text-[14px] text-[#C9C9CF] mt-1.5 leading-snug">When a strategy beats ParallaxPay&rsquo;s own method over 20 or more real trades, ParallaxPay adopts it and credits its creator on every agent that runs it.</p>
          </div>
        </div>
        <Link href={member ? '/desk?strategy=1' : '/start'} className="mt-4 h-11 rounded-full bg-white text-ink text-[14px] font-semibold press grid place-items-center">
          {member ? 'Shape your agent’s strategy' : 'Hire ParallaxPay to make your own'}
        </Link>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3">
        {!data && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-[132px] rounded-[22px] bg-paper-2 animate-pulse" />)}
        {rows.map((s, i) => (
          <Row key={s.id} s={s} rank={ranks[i]} now={now} />
        ))}
      </div>
      {data && rows.every(s => !s.ranked) && <p className="mt-4 text-[13.5px] text-ink-3 leading-snug">A strategy is ranked after {data.minRanked} real trades. Until then it&rsquo;s new, and every trade it closes lands here.</p>}
    </div>
  )
}
