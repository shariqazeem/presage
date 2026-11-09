'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useNow } from '@/components/kit'
import { IconBack, IconLock } from '@/components/icons'
import { shortAccount, useNear } from '@/components/near/NearWallet'
import { Ticket } from '@/components/near/Promises'
import { sayError } from '@/components/near/sheets'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import { useBoardStrategy, useDesk } from '@/lib/near/hooks'
import { cacheStrategy, strategyCall, type UnlockedStrategy } from '@/lib/near/strategyClient'

const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`)

/** One strategy on the board: its record, its sealed settings, and hiring it for your agent. */
export default function BoardStrategy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error } = useBoardStrategy(id)
  const { accountId, signMessage } = useNear()
  const { data: desk } = useDesk(accountId)
  const qc = useQueryClient()
  const now = useNow(30_000)
  const [hired, setHired] = useState<UnlockedStrategy | null>(null)
  const [busy, setBusy] = useState(false)
  const member = Boolean(desk?.member)

  const hire = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const { strategy } = await strategyCall(signMessage, accountId, 'hire', { strategy: id })
      cacheStrategy(accountId, strategy)
      setHired(strategy)
      toast.success(`Your agent runs ${strategy.house ? 'the house method' : strategy.name} from its next read.`)
      void qc.invalidateQueries({ queryKey: ['near-board'] })
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }

  if (error) {
    return (
      <div className="max-w-[720px] mx-auto px-4 pt-10 text-center">
        <p className="text-[15px] text-ink-2">That strategy isn&rsquo;t on the board.</p>
        <Link href="/board" className="inline-block mt-4 font-semibold underline decoration-line underline-offset-2">
          Back to the board
        </Link>
      </div>
    )
  }
  const s = data?.strategy
  const r = data?.record
  const settings = hired?.settings ?? hired?.traits ?? s?.traits ?? null

  return (
    <div className="max-w-[860px] mx-auto px-4 md:px-6 pt-4 md:pt-8 pb-28 md:pb-16">
      <Link href="/board" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-ink-3 hover:text-ink press">
        <IconBack size={15} /> The board
      </Link>

      <section className="mt-3 rounded-[26px] bg-ink text-white p-5 md:p-6 relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        {!s ? (
          <div className="h-[180px] rounded-[16px] bg-white/[0.06] animate-pulse" />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Mark size={40} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-heading text-[26px] md:text-[30px] font-black tight leading-tight">{s.house ? 'The house method' : s.name}</h1>
                  {s.adopted && <span className="rounded-full foil text-white px-2.5 h-[22px] inline-flex items-center text-[10.5px] font-semibold uppercase tracking-[0.07em]">Adopted</span>}
                </div>
                <div className="text-[13px] text-[#A1A1AA] mt-1">{s.house ? 'ParallaxPay’s own method, the default for every agent' : `by ${shortAccount(s.owner)}`}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Real trades', String(r?.trades ?? 0)],
                ['Win rate', r?.trades ? `${Math.round((r.wins / r.trades) * 100)}%` : '—'],
                ['Per trade', pct(r?.avgPct ?? null)],
                ['Agents running it', String(r?.members ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[14px] bg-white/[0.06] px-3.5 py-3">
                  <div className="text-[11.5px] text-[#8A8A92]">{k}</div>
                  <div className="num text-[19px] font-semibold mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[16px] bg-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold">Its settings</span>
                {!settings && (
                  <span className="flex items-center gap-1 text-[12px] text-[#A1A1AA]">
                    <IconLock size={12} /> Sealed
                  </span>
                )}
              </div>
              {settings ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {settings.map(t => (
                    <span key={t} className="rounded-full bg-white/[0.08] px-2.5 h-[26px] inline-flex items-center text-[12.5px] text-[#C9C9CF]">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#A1A1AA] mt-1.5 leading-snug">
                  They unlock when you hire it. Every plan it seals commits to them: <span className="num text-[#C9C9CF]">sha256 {s.hash.slice(0, 12)}…</span>
                </p>
              )}
            </div>
            <div className="mt-4">
              {hired ? (
                <div className="h-12 rounded-[14px] bg-white/10 text-white text-[14.5px] font-semibold grid place-items-center">Your agent runs it now</div>
              ) : member ? (
                <button onClick={hire} disabled={busy} className="w-full h-12 rounded-[14px] bg-white text-ink font-semibold press disabled:opacity-50">
                  {busy ? 'Signing…' : s.house ? 'Run the house method' : 'Hire this strategy for my agent'}
                </button>
              ) : (
                <Link href="/start" className="w-full h-12 rounded-[14px] bg-white text-ink font-semibold press grid place-items-center">
                  Hire ParallaxPay to run it
                </Link>
              )}
              <p className="text-[12px] text-[#8A8A92] mt-2 leading-snug">Your mandate still holds: how much, how often and which coins. The vault enforces it whatever the strategy.</p>
            </div>
          </>
        )}
      </section>

      <section className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Its trades</div>
        <h2 className="font-heading text-[22px] font-black tight mt-0.5">Every one sealed before it happened</h2>
        <div className={cx('grid gap-2 mt-3')}>
          {data?.trades.length ? (
            data.trades.map(t => <Ticket key={t.id} t={t} now={now} />)
          ) : (
            <p className="rounded-[20px] bg-paper-2 p-4 text-[14px] text-ink-2 leading-snug">No trades yet. Each one lands here with the plan it sealed on NEAR, losses included.</p>
          )}
        </div>
      </section>
    </div>
  )
}
