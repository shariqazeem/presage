'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconCheck, IconX } from '../icons'
import { Ring, Sheet, useNow } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { coinBySymbol } from '@/lib/near/config'
import { usePresence, type AgentState, type CoinRead } from '@/lib/near/hooks'
import { Floor, withoutPrice } from './agent'
import { Ask } from './Ask'
import { LiveChart, type ChartTf } from './LiveChart'
import { money } from './kit'
import { LivePrice } from './motion'
import { Chip, Segmented, Sparkline, signedPct } from './primitives'

type Status = { word: string; tone: 'live' | 'strong' | 'muted' }

export function statusOf(r: CoinRead): Status {
  if (r.setup) return { word: 'Setup', tone: 'live' }
  if (r.armedAt) return { word: 'Armed', tone: 'strong' }
  if ((r.checks ?? []).filter(c => c.ok).length >= 4) return { word: 'Close', tone: 'strong' }
  return { word: 'Watching', tone: 'muted' }
}

const ORDER = ['NEAR', 'ZEC', 'RHEA', 'AURORA']

function NextRead({ at }: { at: number }) {
  const now = useNow(1000)
  const left = Math.max(0, at - now)
  return (
    <span className="num">
      {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}
    </span>
  )
}

/** The agent itself: its mark breathing while it works, what it's doing, who's here. */
function AgentBar({ agent }: { agent: AgentState | undefined }) {
  const { data: here } = usePresence()
  const setups = agent?.reads.filter(r => r.setup).length ?? 0
  return (
    <div className="flex items-center gap-3 px-4 md:px-5 h-[64px] border-b border-white/[0.06]">
      <div className="relative">
        <span className="absolute -inset-1 rounded-[14px] foil opacity-40 blur-[6px] animate-[soft-pulse_2.4s_ease-in-out_infinite]" />
        <span className="relative block">
          <Mark size={36} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-tight">ParallaxPay {setups ? 'found a setup' : 'is watching'}</div>
        <div className="text-[12.5px] text-[#A1A1AA] flex items-center gap-1.5 mt-0.5">
          <span className={cx('w-1.5 h-1.5 rounded-full', setups ? 'foil' : 'bg-up-d')} />
          {agent ? (
            <>
              {agent.reads.length} coins · next read in <NextRead at={agent.nextCheckAt} />
            </>
          ) : (
            'connecting…'
          )}
        </div>
      </div>
      <div className="ml-auto text-right hidden sm:block">
        <div className="text-[12.5px] text-[#A1A1AA]">{here ? `${here} ${here === 1 ? 'person' : 'people'} here` : ''}</div>
        <div className="text-[12.5px] text-[#A1A1AA]">{agent?.vault ? `${agent.vault.members} members` : 'Vault opening on mainnet'}</div>
      </div>
    </div>
  )
}

function WatchRow({ r, on, onPick }: { r: CoinRead; on: boolean; onPick: () => void }) {
  const s = statusOf(r)
  return (
    <button onClick={onPick} className={cx('w-full text-left rounded-[14px] px-3 py-3 flex items-center gap-3 press', on ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-heading text-[16px] font-black tight text-white">{r.coin}</span>
          {s.tone !== 'muted' && (
            <Chip tone={s.tone} night>
              {s.word}
            </Chip>
          )}
        </div>
        <div className="text-[12px] text-[#8A8A92] truncate">{coinBySymbol(r.coin)?.name}</div>
      </div>
      <Sparkline points={r.spark ?? []} w={56} h={24} />
      <div className="text-right w-[84px]">
        <LivePrice value={r.price} format={money} className="text-[14px] text-white" />
        <div className={cx('num text-[12px] mt-0.5', (r.change24h ?? 0) >= 0 ? 'text-up-d' : 'text-down-d')}>{signedPct(r.change24h)}</div>
      </div>
    </button>
  )
}

function CoinCard({ r, on, onPick }: { r: CoinRead; on: boolean; onPick: () => void }) {
  const s = statusOf(r)
  return (
    <button onClick={onPick} className={cx('shrink-0 snap-start w-[148px] rounded-[16px] p-3 text-left press border', on ? 'bg-white text-ink border-white' : 'bg-white/[0.05] text-white border-white/[0.06]')}>
      <div className="flex items-center justify-between">
        <span className="font-heading text-[16px] font-black tight">{r.coin}</span>
        {s.tone === 'live' ? <span className="w-2 h-2 rounded-full foil" /> : <span className={cx('text-[11px] font-semibold uppercase tracking-[0.06em]', on ? 'text-ink-3' : 'text-[#8A8A92]')}>{s.word}</span>}
      </div>
      <div className="mt-2">
        <Sparkline points={r.spark ?? []} w={124} h={28} night={!on} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <LivePrice value={r.price} format={money} className="text-[14px]" />
        <span className={cx('num text-[11.5px]', (r.change24h ?? 0) >= 0 ? (on ? 'text-up' : 'text-up-d') : on ? 'text-down' : 'text-down-d')}>{signedPct(r.change24h)}</span>
      </div>
    </button>
  )
}

/** The checklist as a ring (how many of the six pass) that opens into the full list. */
function Checks({ r }: { r: CoinRead }) {
  const [open, setOpen] = useState(false)
  const checks = r.checks ?? []
  const passed = checks.filter(c => c.ok).length
  return (
    <div className="rounded-[18px] bg-white/[0.04] border border-white/[0.06]">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-3.5 text-left press">
        <Ring progress={checks.length ? passed / checks.length : 0} size={44} stroke={4} label={`${passed}/${checks.length}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{passed === checks.length && checks.length ? 'Every check passes' : `${checks.length - passed} check${checks.length - passed === 1 ? '' : 's'} to go`}</div>
          <div className="text-[12.5px] text-[#A1A1AA] truncate">{checks.find(c => !c.ok)?.label ?? 'All six of its rules agree'}</div>
        </div>
        <span className="text-[12.5px] text-[#A1A1AA]">{open ? 'Hide' : 'See all'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3.5 pb-3.5 grid gap-2.5">
              {checks.map(c => (
                <li key={c.key} className="flex items-start gap-2.5">
                  <span className={cx('mt-[1px] w-5 h-5 rounded-full grid place-items-center shrink-0', c.ok == null ? 'bg-white/10 text-[#8A8A92]' : c.ok ? 'bg-up-d text-ink' : 'bg-white/10 text-down-d')}>
                    {c.ok == null ? <span className="w-1 h-1 rounded-full bg-current" /> : c.ok ? <IconCheck size={12} weight={3} /> : <IconX size={11} weight={3} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-white leading-tight">{c.label}</div>
                    <div className="text-[12px] text-[#8A8A92] leading-snug mt-0.5">{c.note}</div>
                  </div>
                </li>
              ))}
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

/** What it's thinking about this coin, said as a message from the agent. */
function Thought({ r }: { r: CoinRead }) {
  return (
    <div className="flex gap-2.5">
      <Mark size={28} />
      <div className="rounded-[16px] rounded-tl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-[14.5px] leading-snug text-[#F4F4F2]">{withoutPrice(r)}</div>
    </div>
  )
}

/**
 * The floor's terminal: the agent, every coin it watches, the picked coin's live chart with the agent's
 * own levels and MFI, what it's thinking, its checklist, and (on wide screens) the live floor and the ask box.
 */
export function Terminal({ agent, compact = false }: { agent: AgentState | undefined; compact?: boolean }) {
  const reads = [...(agent?.reads ?? [])].sort((a, b) => ORDER.indexOf(a.coin) - ORDER.indexOf(b.coin))
  const [pick, setPick] = useState<string | null>(null)
  const [tf, setTf] = useState<ChartTf>('1h')
  const [shot, setShot] = useState(false)
  // The ticker links here with ?coin=ZEC.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('coin')
    if (c) setPick(c.toUpperCase())
  }, [])
  const r = reads.find(x => x.coin === pick) ?? reads.find(x => x.setup) ?? reads[0]
  const s = r ? statusOf(r) : null

  return (
    <div className="rounded-[24px] bg-ink text-white overflow-hidden relative shadow-[0_40px_90px_-40px_rgba(11,11,12,0.6)]">
      <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
      <AgentBar agent={agent} />

      <div className={cx('grid', !compact && 'lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px]')}>
        <div className={cx(!compact && 'lg:border-r lg:border-white/[0.06]')}>
          <div className={cx('hidden p-2', !compact && 'lg:grid gap-0.5')}>
            {reads.map(x => (
              <WatchRow key={x.coin} r={x} on={x.coin === r?.coin} onPick={() => setPick(x.coin)} />
            ))}
          </div>
          <div className={cx('flex gap-2 overflow-x-auto no-scrollbar snap-x px-4 pt-3 pb-1', !compact && 'lg:hidden')}>
            {reads.map(x => (
              <CoinCard key={x.coin} r={x} on={x.coin === r?.coin} onPick={() => setPick(x.coin)} />
            ))}
          </div>
          {!reads.length && <div className="h-[200px] m-3 rounded-[14px] bg-white/[0.04] animate-pulse" />}
        </div>

        <div className="min-w-0 pb-4">
          {r && s ? (
            <>
              <div className="px-4 md:px-5 pt-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-[20px] font-black tight">{r.coin}</span>
                    <span className="text-[13px] text-[#8A8A92]">{coinBySymbol(r.coin)?.name}</span>
                  </div>
                  <div className="flex items-baseline gap-2.5 mt-1">
                    <LivePrice value={r.price} format={money} className="text-[32px] md:text-[36px] font-semibold" />
                    <span className={cx('num text-[14px]', (r.change24h ?? 0) >= 0 ? 'text-up-d' : 'text-down-d')}>{signedPct(r.change24h)} 24h</span>
                  </div>
                </div>
                <Chip tone={s.tone} night>
                  {s.word}
                </Chip>
              </div>

              {r.setup && (
                <div className="mx-4 md:mx-5 mt-3 grid grid-cols-3 gap-2">
                  {[
                    ['Buy near', r.price],
                    ['Stop', r.setup.stop],
                    ['Target', r.setup.target],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-[14px] bg-white/[0.06] px-3 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A8A92]">{k as string}</div>
                      <div className="num text-[15px] mt-0.5">{money(v as number)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 md:px-5 mt-3 flex items-center justify-between gap-3">
                <Segmented
                  night
                  size="sm"
                  layoutId={`tf-${compact ? 'desk' : 'floor'}`}
                  value={tf}
                  onChange={setTf}
                  options={(['15m', '1h', '4h', '1d'] as ChartTf[]).map(t => ({ value: t, label: t.toUpperCase() }))}
                />
                <button onClick={() => setShot(true)} className="text-[12.5px] text-[#A1A1AA] hover:text-white press">
                  The chart it read →
                </button>
              </div>
              <div className="px-2 md:px-3 mt-2">
                <LiveChart coin={r.coin} tf={tf} height={compact ? 240 : 300} levels={{ support: r.levels?.support, r1: r.levels?.r1, r2: r.levels?.r2, stop: r.setup?.stop, target: r.setup?.target }} />
              </div>

              <div className="px-4 md:px-5 mt-3 grid gap-3">
                <Thought r={r} />
                <Checks r={r} />
              </div>

              <Sheet open={shot} onClose={() => setShot(false)} title={`What ParallaxPay read on ${r.coin}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/near/chart/${r.coin}`} alt={`ParallaxPay's ${r.coin} chart: 1D, 4H, 1H and 15m with its support, resistance and MFI`} className="w-full rounded-[14px] border border-line" />
                <p className="text-[13px] text-ink-3 mt-3 leading-snug">Four timeframes with the support (green) and resistance (red) it found, and MFI under each. It reads this every 15 minutes; when it finds a setup, the analyst on NEAR AI checks this same image.</p>
              </Sheet>
            </>
          ) : (
            <div className="h-[420px] m-4 rounded-[14px] bg-white/[0.04] animate-pulse" />
          )}
        </div>

        {!compact && (
          <aside className="hidden xl:flex flex-col border-l border-white/[0.06] min-h-0">
            <div className="p-4 border-b border-white/[0.06]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92] mb-2">Ask it</div>
              <Ask coin={r?.coin} />
            </div>
            <div className="p-4 flex-1 min-h-0 max-h-[640px] overflow-y-auto no-scrollbar">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92] mb-1">The floor</div>
              <Floor lines={agent?.feed ?? []} max={14} dark />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
