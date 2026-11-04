'use client'

import { useState } from 'react'
import { Sheet, useNow } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { coinBySymbol } from '@/lib/near/config'
import { usePresence, type AgentState, type CoinRead } from '@/lib/near/hooks'
import { Checklist, Floor, withoutPrice } from './agent'
import { Ask } from './Ask'
import { LiveChart, TfTabs, type ChartTf } from './LiveChart'
import { money } from './kit'

type Status = { word: string; tone: 'setup' | 'armed' | 'close' | 'watch' }

export function statusOf(r: CoinRead): Status {
  if (r.setup) return { word: 'Setup', tone: 'setup' }
  if (r.armedAt) return { word: 'Armed', tone: 'armed' }
  if ((r.checks ?? []).filter(c => c.ok).length >= 4) return { word: 'Close', tone: 'close' }
  return { word: 'Watching', tone: 'watch' }
}

const CHIP: Record<Status['tone'], string> = {
  setup: 'foil text-white',
  armed: 'bg-white text-ink',
  close: 'bg-white/15 text-white',
  watch: 'bg-white/[0.06] text-[#8A8A92]',
}

function Spark({ points, up, w = 56, h = 22 }: { points: number[]; up: boolean; w?: number; h?: number }) {
  if (points.length < 2) return <span style={{ width: w, height: h }} />
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const xy = points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`)
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={xy.join(' ')} fill="none" stroke={up ? '#3DDC84' : '#FF6B6B'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const pct = (v: number | null | undefined) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`)

function TokenRow({ r, on, onPick }: { r: CoinRead; on: boolean; onPick: () => void }) {
  const s = statusOf(r)
  const up = (r.change24h ?? 0) >= 0
  const coin = coinBySymbol(r.coin)
  return (
    <button onClick={onPick} className={cx('w-full text-left rounded-[14px] px-3 py-2.5 flex items-center gap-3 transition-colors', on ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]')}>
      <span className={cx('w-1 self-stretch rounded-full', on ? 'foil-line' : 'bg-transparent')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-heading text-[15px] font-black tight text-white">{r.coin}</span>
          <span className={cx('label !text-[8.5px] px-1.5 py-0.5 rounded-full', CHIP[s.tone])}>{s.word}</span>
        </div>
        <div className="text-[11.5px] text-[#8A8A92] truncate">{coin?.name}</div>
      </div>
      <Spark points={r.spark ?? []} up={up} />
      <div className="text-right w-[76px]">
        <div className="num text-[13px] text-white">{money(r.price)}</div>
        <div className={cx('num text-[11px]', up ? 'text-up-d' : 'text-down-d')}>{pct(r.change24h)}</div>
      </div>
    </button>
  )
}

function NextRead({ at }: { at: number }) {
  const now = useNow(1000)
  const left = Math.max(0, at - now)
  return (
    <span className="num">
      {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}
    </span>
  )
}

/**
 * The trading desk ParallaxPay works at: every coin it watches with its status, the picked coin's
 * live chart with the agent's own levels and MFI underneath, what it thinks, and its checklist.
 */
export function Terminal({ agent, compact = false }: { agent: AgentState | undefined; compact?: boolean }) {
  const reads = agent?.reads ?? []
  const order = ['NEAR', 'ZEC', 'RHEA', 'AURORA']
  const sorted = [...reads].sort((a, b) => order.indexOf(a.coin) - order.indexOf(b.coin))
  const [pick, setPick] = useState<string | null>(null)
  const [tf, setTf] = useState<ChartTf>('1h')
  const [shot, setShot] = useState(false)
  const r = sorted.find(x => x.coin === pick) ?? sorted.find(x => x.setup) ?? sorted[0]
  const s = r ? statusOf(r) : null
  const up = (r?.change24h ?? 0) >= 0
  const setups = sorted.filter(x => x.setup).length
  const { data: here } = usePresence()

  return (
    <div className="rounded-[24px] bg-ink text-white overflow-hidden relative shadow-[0_30px_80px_-30px_rgba(11,11,12,0.55)]">
      <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
      <div className="px-4 md:px-5 pt-4 pb-3 flex items-center gap-3 border-b border-white/[0.06]">
        <Mark size={30} />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-tight">ParallaxPay is trading</div>
          <div className="text-[11.5px] text-[#8A8A92] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-up-d animate-[soft-pulse_2s_ease-in-out_infinite]" />
            {agent ? (
              <>
                {sorted.length} coins · next read in <NextRead at={agent.nextCheckAt} />
              </>
            ) : (
              'connecting…'
            )}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="label !text-[9px] text-[#8A8A92]">{setups ? `${setups} setup${setups === 1 ? '' : 's'} live` : 'no setup right now'}</div>
          {here != null && <div className="text-[11.5px] text-[#C9C9CF]">{here} {here === 1 ? 'person' : 'people'} watching</div>}
        </div>
      </div>

      <div className={cx('grid', !compact && 'lg:grid-cols-[336px_1fr]')}>
        {/* the watchlist: a column on desktop, a scroller on phones */}
        <div className={cx('border-white/[0.06]', !compact ? 'lg:border-r' : '', 'p-2')}>
          <div className={cx('hidden', !compact && 'lg:grid gap-0.5')}>
            {sorted.map(x => (
              <TokenRow key={x.coin} r={x} on={x.coin === r?.coin} onPick={() => setPick(x.coin)} />
            ))}
          </div>
          <div className={cx('flex gap-1.5 overflow-x-auto no-scrollbar px-1', !compact && 'lg:hidden')}>
            {sorted.map(x => {
              const st = statusOf(x)
              return (
                <button key={x.coin} onClick={() => setPick(x.coin)} className={cx('shrink-0 rounded-[12px] px-3 py-2 text-left transition-colors', x.coin === r?.coin ? 'bg-white text-ink' : 'bg-white/[0.06] text-white')}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-[14px] font-black tight">{x.coin}</span>
                    {st.tone === 'setup' && <span className="w-1.5 h-1.5 rounded-full foil" />}
                  </div>
                  <div className={cx('num text-[11px]', (x.change24h ?? 0) >= 0 ? (x.coin === r?.coin ? 'text-up' : 'text-up-d') : x.coin === r?.coin ? 'text-down' : 'text-down-d')}>
                    {money(x.price)} {pct(x.change24h)}
                  </div>
                </button>
              )
            })}
          </div>
          {!reads.length && <div className="h-[220px] m-2 rounded-[12px] bg-white/[0.04] animate-pulse" />}
          {!compact && (agent?.feed.length ?? 0) > 0 && (
            <div className="hidden lg:block mt-3 mx-1 pt-3 border-t border-white/[0.06]">
              <div className="label !text-[9px] text-[#8A8A92] px-2 mb-1">On the floor</div>
              <div className="px-2 [&_p]:line-clamp-2 [&_p]:text-[12.5px]">
                <Floor lines={agent!.feed} max={4} dark />
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {r && s ? (
            <div key={r.coin}>
              <div className="px-4 md:px-5 pt-3 md:pt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-heading text-[22px] font-black tight">{r.coin}</span>
                    <span className="num text-[26px] md:text-[30px] font-semibold leading-none">{money(r.price)}</span>
                    <span className={cx('num text-[13px]', up ? 'text-up-d' : 'text-down-d')}>{pct(r.change24h)} 24h</span>
                  </div>
                </div>
                <span className={cx('label !text-[9.5px] px-2.5 py-1 rounded-full', CHIP[s.tone])}>{s.word}</span>
              </div>
              <p className="px-4 md:px-5 text-[14px] text-[#E6E6E3] leading-snug mt-2 max-w-[640px]">{withoutPrice(r)}</p>
              {r.setup && (
                <div className="mx-4 md:mx-5 mt-3 grid grid-cols-3 gap-2">
                  {[
                    ['Buy near', r.price],
                    ['Stop', r.setup.stop],
                    ['Target', r.setup.target],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-[12px] bg-white/[0.06] px-3 py-2">
                      <div className="label !text-[9px] text-[#8A8A92]">{k as string}</div>
                      <div className="num text-[14px]">{money(v as number)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-2 md:px-3 mt-3">
                <div className="flex items-center justify-between px-2 mb-1">
                  <TfTabs tf={tf} onChange={setTf} />
                  <button onClick={() => setShot(true)} className="text-[12px] text-[#8A8A92] hover:text-white underline decoration-white/20 underline-offset-2">
                    The chart it read
                  </button>
                </div>
                <LiveChart coin={r.coin} tf={tf} height={compact ? 250 : 320} levels={{ support: r.levels?.support, r1: r.levels?.r1, r2: r.levels?.r2, stop: r.setup?.stop, target: r.setup?.target }} />
              </div>
              {!compact && (
                <div className="px-4 md:px-5 pb-5 pt-4 border-t border-white/[0.06] mt-2 grid xl:grid-cols-[1fr_1fr] gap-5">
                  <Checklist r={r} />
                  <div>
                    <div className="label !text-[9.5px] text-[#8A8A92] mb-2">Ask it</div>
                    <Ask coin={r.coin} />
                  </div>
                </div>
              )}
              <Sheet open={shot} onClose={() => setShot(false)} title={`What ParallaxPay read on ${r.coin}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/near/chart/${r.coin}`} alt={`ParallaxPay's ${r.coin} chart: 1D, 4H, 1H and 15m with its support, resistance and MFI`} className="w-full rounded-[14px] border border-line" />
                <p className="text-[13px] text-ink-3 mt-3 leading-snug">Four timeframes with the support (green) and resistance (red) it detected, and MFI under each. It re-reads this every 15 minutes; when it finds a setup, the analyst on NEAR AI checks this same image.</p>
              </Sheet>
            </div>
          ) : (
            <div className="h-[420px] m-4 rounded-[14px] bg-white/[0.04] animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}
