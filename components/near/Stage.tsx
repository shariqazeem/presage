'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconX } from '../icons'
import { Ring, Sheet, useNow } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { coinBySymbol } from '@/lib/near/config'
import { px, type DrawTf } from '@/lib/near/drawing'
import { usePresence, type AgentState, type CoinRead } from '@/lib/near/hooks'
import { AgentDrawing } from './AgentDrawing'
import { ago } from './kit'
import { LivePrice } from './motion'
import { Segmented, signedPct } from './primitives'

/**
 * The stage: ParallaxPay at work. Its drawing of the coin it is reading, what it says about it, its
 * checks, and the four coins it watches. This is the first thing anyone sees.
 */

const ORDER = ['NEAR', 'ZEC', 'RHEA', 'AURORA']
const READ_EVERY = 15 * 60

export type Status = { word: string; tone: 'live' | 'close' | 'quiet' }

export function statusOf(r: CoinRead): Status {
  if (r.setup) return { word: 'Setup', tone: 'live' }
  if (r.armedAt) return { word: 'Armed', tone: 'close' }
  if ((r.checks ?? []).filter(c => c.ok).length >= 4) return { word: 'Close', tone: 'close' }
  return { word: 'Watching', tone: 'quiet' }
}

/** What it says about a coin, in its own voice. */
export function voice(r: CoinRead): string {
  const sup = r.support
  const dist = r.supportDistPct
  const checks = r.checks ?? []
  const failed = (key: string) => checks.find(c => c.key === key)?.ok === false
  if (r.setup) return `I'd buy ${r.coin} here. It's on ${sup ? `its ${sup.tf} support at ${px(sup.price)}` : 'support'} and money flow has bottomed. Stop ${px(r.setup.stop)}, target ${px(r.setup.target)}.`
  let where: string
  if (!sup || dist == null) where = `${r.coin} has no support close enough to lean on.`
  else if (dist < 0) where = `${r.coin} slipped just under its ${sup.tf} level at ${px(sup.price)}.`
  else if (dist <= 2.5) where = `${r.coin} is ${dist.toFixed(1)}% above its ${sup.tf} support at ${px(sup.price)}.`
  else where = `${r.coin} is ${dist.toFixed(1)}% above its nearest support at ${px(sup.price)}.`
  let wait: string
  if (failed('trend')) wait = 'The daily trend is falling, so I stay out until it turns.'
  else if (sup && dist != null && dist < 0) wait = 'I need it to win that level back before I buy.'
  else if (failed('momentum')) wait = `Money flow hasn't bottomed${r.mfi15 != null ? ` (MFI ${Math.round(r.mfi15)} on the 15m)` : ''}, so I'm waiting for it to flush and turn up.`
  else if (sup && dist != null && dist > 2.5) wait = 'I wait for a pullback to it.'
  else if (failed('htf')) wait = 'The bigger picture is weak, so I want a clean bounce first.'
  else if (failed('room')) wait = "There isn't enough room to the next resistance to be worth the risk."
  else wait = 'Everything lines up. I measure the risk before I commit.'
  return `${where} ${wait}`
}

/** The level a read is trading, as the drawing labels it. */
export function focusOf(r: CoinRead) {
  if (!r.support) return null
  return { price: r.support.price, label: `Its level ${px(r.support.price)}` }
}

function Heartbeat({ at }: { at: number }) {
  const now = useNow(1000)
  const left = Math.max(0, at - now)
  const reading = left === 0
  return (
    <div className="flex items-center gap-2.5">
      <Ring progress={reading ? 1 : 1 - left / READ_EVERY} size={34} stroke={3} label="" />
      <div className="leading-tight">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">{reading ? 'Reading' : 'Next read'}</div>
        <div className="num text-[15px] text-white">{reading ? 'now…' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</div>
      </div>
    </div>
  )
}

function StatusChip({ s }: { s: Status }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 h-[24px] text-[11px] font-semibold uppercase tracking-[0.07em]',
        s.tone === 'live' && 'foil text-white',
        s.tone === 'close' && 'bg-white text-ink',
        s.tone === 'quiet' && 'bg-white/[0.08] text-[#A1A1AA]',
      )}
    >
      {s.tone !== 'live' && <span className={cx('w-1.5 h-1.5 rounded-full', s.tone === 'close' ? 'bg-ink' : 'bg-up-d animate-[soft-pulse_2s_ease-in-out_infinite]')} />}
      {s.word}
    </span>
  )
}

/** Its six checks: how close this coin is to a trade, ticking in one after another. */
function Thinking({ r }: { r: CoinRead }) {
  const checks = r.checks ?? []
  const passed = checks.filter(c => c.ok).length
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">Its checks</div>
        <div className="num text-[13px] text-white">
          {passed}/{checks.length}
        </div>
      </div>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, checks.length)}, 1fr)` }}>
        {checks.map((c, i) => (
          <span key={c.key} className={cx('h-1.5 rounded-full tick-in', c.ok ? 'bg-up-d' : c.ok === false ? 'bg-white/[0.12]' : 'bg-white/[0.06]')} style={{ animationDelay: `${300 + i * 90}ms` }} />
        ))}
      </div>
      <ul className="mt-3.5 grid gap-3">
        {checks.map((c, i) => (
          <li key={c.key} className="flex items-start gap-2.5">
            <span
              className={cx('mt-[1px] w-5 h-5 rounded-full grid place-items-center shrink-0 tick-in', c.ok == null ? 'bg-white/[0.06] text-[#6B6B72]' : c.ok ? 'bg-up-d text-ink' : 'bg-white/[0.08] text-down-d')}
              style={{ animationDelay: `${300 + i * 90}ms` }}
            >
              {c.ok == null ? <span className="w-1 h-1 rounded-full bg-current" /> : c.ok ? <IconCheck size={12} weight={3} /> : <IconX size={11} weight={3} />}
            </span>
            <div className="min-w-0">
              <div className={cx('text-[13.5px] leading-tight', c.ok ? 'text-white' : 'text-[#C9C9CF]')}>{c.label}</div>
              <div className="text-[12px] text-[#8A8A92] leading-snug mt-0.5">{c.note}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Eye({ r, on, onPick }: { r: CoinRead; on: boolean; onPick: () => void }) {
  const s = statusOf(r)
  const checks = r.checks ?? []
  const passed = checks.filter(c => c.ok).length
  return (
    <button
      onClick={onPick}
      aria-pressed={on}
      className={cx('shrink-0 snap-start w-[168px] lg:w-auto rounded-[18px] p-3 text-left press border transition-colors', on ? 'bg-white/[0.09] border-white/25' : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-[15px] font-black tight text-white">{r.coin}</span>
        {s.tone === 'live' ? <span className="w-2 h-2 rounded-full foil" /> : <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A8A92]">{s.word}</span>}
      </div>
      <AgentDrawing coin={r.coin} tf="1h" size="thumb" focus={focusOf(r)} className="h-[54px] mt-2" label={`ParallaxPay's drawing of ${r.coin}`} />
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <LivePrice value={r.price} format={px} className="text-[13px] text-white" />
        <span className="num text-[11.5px] text-[#8A8A92]">
          {passed}/{checks.length} checks
        </span>
      </div>
    </button>
  )
}

export function Stage({ agent }: { agent: AgentState | undefined }) {
  const reads = [...(agent?.reads ?? [])].sort((a, b) => ORDER.indexOf(a.coin) - ORDER.indexOf(b.coin))
  const [pick, setPick] = useState<string | null>(null)
  const [tf, setTf] = useState<DrawTf>('1h')
  const [shot, setShot] = useState(false)
  const now = useNow(30_000)
  const { data: here } = usePresence()
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('coin')
    if (c) setPick(c.toUpperCase())
  }, [])
  // With nothing picked, it looks at the coin closest to a trade.
  const closest = [...reads].sort((a, b) => Number(Boolean(b.setup)) - Number(Boolean(a.setup)) || (b.checks ?? []).filter(c => c.ok).length - (a.checks ?? []).filter(c => c.ok).length)[0]
  const r = reads.find(x => x.coin === pick) ?? closest
  const s = r ? statusOf(r) : null

  return (
    <div className="rounded-[28px] bg-ink text-white overflow-hidden relative shadow-[0_40px_90px_-40px_rgba(11,11,12,0.55)]">
      <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />

      {/* the agent */}
      <div className="flex items-center gap-3 px-4 md:px-6 pt-4 md:pt-5">
        <div className="relative shrink-0">
          <span className="absolute -inset-1 rounded-[14px] foil opacity-40 blur-[6px] animate-[soft-pulse_2.4s_ease-in-out_infinite]" />
          <span className="relative block">
            <Mark size={40} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-tight">ParallaxPay</div>
          <div className="text-[12.5px] text-[#A1A1AA] mt-0.5 truncate">
            {r ? `Reading ${r.coin} · ${tf.toUpperCase()}` : 'Waking up…'}
            {here ? ` · ${here} ${here === 1 ? 'person' : 'people'} here` : ''}
          </div>
        </div>
        {agent && <Heartbeat at={agent.nextCheckAt} />}
      </div>

      {r && s ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_330px] gap-5 lg:gap-6 px-4 md:px-6 pt-4 pb-5">
          {/* Phones show the coin and its drawing first, then what it says; wide screens lead with its words. */}
          <div className="min-w-0 flex flex-col">
            <div key={r.coin} className="order-3 lg:order-1 mt-3 lg:mt-0 flex gap-2.5 animate-[rise_.4s_ease-out]">
              <div className="rounded-[18px] rounded-tl-[6px] bg-white/[0.07] px-4 py-3 text-[15px] md:text-[16px] leading-snug text-[#F4F4F2] max-w-[720px]">{voice(r)}</div>
            </div>

            <div className="order-1 lg:order-2 lg:mt-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-heading text-[20px] md:text-[22px] font-black tight">{r.coin}</span>
                  <span className="text-[13px] text-[#8A8A92] hidden sm:inline">{coinBySymbol(r.coin)?.name}</span>
                  <StatusChip s={s} />
                </div>
                <div className="flex items-baseline gap-2.5 mt-1">
                  <LivePrice value={r.price} format={px} className="text-[26px] md:text-[32px] font-semibold" />
                  <span className={cx('num text-[13px]', (r.change24h ?? 0) >= 0 ? 'text-up-d' : 'text-down-d')}>{signedPct(r.change24h)} 24h</span>
                </div>
              </div>
              <div className="hidden sm:block">
                <Segmented night size="sm" layoutId="stage-tf" value={tf} onChange={setTf} options={(['1d', '4h', '1h', '15m'] as DrawTf[]).map(t => ({ value: t, label: t.toUpperCase() }))} />
              </div>
            </div>

            <div className="order-2 lg:order-3">
              <div className="mt-3 -mx-1 rounded-[18px] bg-[#0E0E10] border border-white/[0.05] p-2 md:p-3">
                <AgentDrawing
                  coin={r.coin}
                  tf={tf}
                  size="stage"
                  focus={focusOf(r)}
                  plan={r.setup ? { entry: r.price, stop: r.setup.stop, target: r.setup.target } : null}
                  className="aspect-[1/1] sm:aspect-[16/10] lg:aspect-[16/9]"
                />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 text-[12.5px] text-[#8A8A92]">
                <div className="sm:hidden">
                  <Segmented night size="sm" layoutId="stage-tf-phone" value={tf} onChange={setTf} options={(['1d', '4h', '1h', '15m'] as DrawTf[]).map(t => ({ value: t, label: t.toUpperCase() }))} />
                </div>
                <span className="hidden sm:inline">Drawn with its own code · read {ago(r.at, now)}</span>
                <button onClick={() => setShot(true)} className="font-semibold text-[#C9C9CF] hover:text-white press text-right">
                  <span className="sm:hidden">Exact chart →</span>
                  <span className="hidden sm:inline">The exact chart it read →</span>
                </button>
              </div>
            </div>
          </div>

          {/* its thinking */}
          <div key={`t-${r.coin}`} className="lg:border-l lg:border-white/[0.06] lg:pl-6">
            <Thinking r={r} />
          </div>
        </div>
      ) : (
        <div className="px-4 md:px-6 py-5">
          <div className="h-[56px] rounded-[18px] bg-white/[0.05] animate-pulse" />
          <div className="mt-4 aspect-[16/9] rounded-[18px] bg-white/[0.04] animate-pulse" />
        </div>
      )}

      {/* its eyes: every coin it watches */}
      <div className="border-t border-white/[0.06] px-4 md:px-6 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92] mb-2.5">Watching {reads.length || 4} coins</div>
        <div className="flex lg:grid lg:grid-cols-4 gap-2.5 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 lg:mx-0 lg:px-0">
          {reads.map(x => (
            <Eye key={x.coin} r={x} on={x.coin === r?.coin} onPick={() => setPick(x.coin)} />
          ))}
        </div>
      </div>

      {r && (
        <Sheet open={shot} onClose={() => setShot(false)} title={`The chart ParallaxPay read on ${r.coin}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/near/chart/${r.coin}`} alt={`ParallaxPay's ${r.coin} chart: 1D, 4H, 1H and 15m with its support, resistance and MFI`} className="w-full rounded-[14px] border border-line" />
          <p className="text-[13px] text-ink-3 mt-3 leading-snug">The exact image it read at its last check: four timeframes with the support (green) and resistance (red) it mapped, its trendlines, and money flow under each. When it finds a setup, the NEAR AI analyst checks this same image.</p>
        </Sheet>
      )}
    </div>
  )
}
