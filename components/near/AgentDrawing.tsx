'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Candle } from '@/lib/market/types'
import { WARMUP, WINDOW, px, readChart, type DrawTf, type Drawing } from '@/lib/near/drawing'
import { cx } from '../ui'

/**
 * ParallaxPay's drawing of a coin: the candles it reads, the support and resistance it mapped (with
 * touch counts), the trendlines it fitted, money flow underneath, and, when there is one, its plan.
 * Computed in the browser with the agent's own code (lib/near/drawing.ts) and drawn as plain SVG at
 * the exact size of its box, so it stays sharp and needs no chart library. On first sight it plays the
 * drawing sequence: candles print, levels draw across, trendlines extend, money flow traces.
 */

export type DrawPlan = { entry?: number | null; stop?: number | null; target?: number | null; from?: number | null }
export type DrawMarker = { at: number; price: number; label: string; tone: 'in' | 'out' }
export type DrawFocus = { price: number; label: string }
type Size = 'stage' | 'card' | 'thumb'

const C = { up: '#3DDC84', down: '#FF6B6B', flow: '#A78BFA', grid: 'rgba(255,255,255,0.06)', axis: '#6B6B72', now: 'rgba(255,255,255,0.4)' }
const CH = 6.6 // advance of one 11px IBM Plex Mono character
const PILL_H = 18

export function useDrawCandles(coin: string, tf: DrawTf, refreshMs = 60_000) {
  return useQuery({
    queryKey: ['near-draw', coin, tf],
    queryFn: async () => {
      const r = await fetch(`/api/near/candles?coin=${encodeURIComponent(coin)}&tf=${tf}`)
      if (!r.ok) throw new Error('No candles')
      const body = (await r.json()) as { candles: Candle[] }
      return body.candles.slice(-(WINDOW[tf] + WARMUP))
    },
    refetchInterval: refreshMs,
    staleTime: 30_000,
  })
}

export function AgentDrawing({
  coin,
  tf = '1h',
  size = 'stage',
  plan,
  focus,
  markers,
  animate = true,
  className,
  label,
}: {
  coin: string
  tf?: DrawTf
  size?: Size
  plan?: DrawPlan | null
  focus?: DrawFocus | null
  markers?: DrawMarker[]
  animate?: boolean
  /** The box's size comes from here (an aspect ratio or a height); the drawing fills it. */
  className?: string
  label?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width)
      const h = Math.round(e.contentRect.height)
      setDim(d => (d && d.w === w && d.h === h ? d : w > 40 && h > 30 ? { w, h } : null))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { data: candles } = useDrawCandles(coin, tf, size === 'thumb' ? 300_000 : 60_000)
  const drawing = useMemo(() => (candles ? readChart(candles, tf) : null), [candles, tf])
  return (
    <div ref={box} className={cx('relative', className)}>
      {dim && drawing ? (
        <Picture key={`${coin}-${tf}`} d={drawing} w={dim.w} h={dim.h} size={size} plan={plan} focus={focus} markers={markers} animate={animate} label={label ?? `ParallaxPay's ${tf.toUpperCase()} drawing of ${coin}`} />
      ) : (
        size !== 'thumb' && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="absolute inset-x-0 top-[22%] h-px bg-white/[0.05]" />
            <div className="absolute inset-x-0 top-[48%] h-px bg-white/[0.05]" />
            <div className="absolute inset-x-0 top-[74%] h-px bg-white/[0.05]" />
            <span className="text-[12.5px] text-[#6B6B72] animate-[soft-pulse_1.6s_ease-in-out_infinite]">Reading {coin}…</span>
          </div>
        )
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ geometry */

function layout(d: Drawing, w: number, h: number, size: Size, plan?: DrawPlan | null, focus?: DrawFocus | null) {
  const stage = size === 'stage'
  const thumb = size === 'thumb'
  const hasPlan = Boolean(plan && (plan.stop || plan.target))
  const right = thumb ? (hasPlan ? Math.round(w * 0.12) : 3) : hasPlan ? Math.max(96, Math.round(w * 0.18)) : stage ? (w < 480 ? 58 : 72) : 10
  const flowH = thumb ? 0 : Math.round(h * (stage ? 0.21 : 0.18))
  const gap = flowH ? (stage ? 14 : 8) : 0
  const top = thumb ? 4 : 12
  const bottom = thumb ? 4 : 6
  const priceH = h - top - bottom - flowH - gap
  const plotR = w - right
  const minBar = stage ? 4.6 : size === 'card' ? 3.4 : 2.8
  const n = d.candles.length
  const show = Math.min(n, Math.max(24, Math.floor(plotR / minBar)))
  const offset = n - show
  const bars = d.candles.slice(offset)
  let hi = -Infinity
  let lo = Infinity
  for (const b of bars) {
    if (b.h > hi) hi = b.h
    if (b.l < lo) lo = b.l
  }
  for (const p of [plan?.stop, plan?.target, plan?.entry, focus?.price]) {
    if (p && p > 0) {
      hi = Math.max(hi, p)
      lo = Math.min(lo, p)
    }
  }
  const pad = (hi - lo) * 0.08 || hi * 0.01
  const yMax = hi + pad
  const yMin = lo - pad
  const y = (p: number) => top + priceH * (1 - (p - yMin) / (yMax - yMin))
  const cw = plotR / show
  const x = (i: number) => (i - offset) * cw + cw / 2
  const flowTop = top + priceH + gap
  const fy = (v: number) => flowTop + flowH * (1 - v / 100)
  const inRange = (p: number) => p >= yMin && p <= yMax
  return { w, h, top, priceH, plotR, right, flowTop, flowH, n, offset, show, cw, bars, x, y, fy, inRange, yMin, yMax, hasPlan }
}

type Tag = { y: number; text: string; tone: Tone; key: string }
type Tone = 'up' | 'down' | 'flow' | 'foil' | 'now' | 'white'

/** Keeps labels in one column from sitting on top of each other. */
function spread(tags: Tag[], min: number, max: number): Tag[] {
  const s = tags.map(t => ({ ...t })).sort((a, b) => a.y - b.y)
  const gap = PILL_H + 4
  for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < gap) s[i].y = s[i - 1].y + gap
  const over = s.length ? s[s.length - 1].y - max : 0
  if (over > 0) for (const t of s) t.y -= over
  for (let i = 0; i < s.length; i++) s[i].y = Math.max(min + i * gap, s[i].y)
  return s
}

const TONE: Record<Tone, { bg: string; fg: string }> = {
  up: { bg: 'rgba(61,220,132,0.15)', fg: C.up },
  down: { bg: 'rgba(255,107,107,0.15)', fg: C.down },
  flow: { bg: 'rgba(167,139,250,0.16)', fg: C.flow },
  foil: { bg: '', fg: '#FFFFFF' },
  now: { bg: '#FFFFFF', fg: '#0B0B0C' },
  white: { bg: 'rgba(255,255,255,0.12)', fg: '#FFFFFF' },
}

function Pill({ x, y, text, tone, anchor = 'start', foil, delay, animate }: { x: number; y: number; text: string; tone: Tone; anchor?: 'start' | 'end'; foil: string; delay: number; animate: boolean }) {
  const w = Math.ceil(text.length * CH + 12)
  const left = anchor === 'end' ? x - w : x
  const t = TONE[tone]
  return (
    <g className={animate ? 'dr-pop' : undefined} style={animate ? { animationDelay: `${delay}ms` } : undefined}>
      {tone !== 'foil' && tone !== 'now' && <rect x={left} y={y - PILL_H / 2} width={w} height={PILL_H} rx={6} fill="#0B0B0C" opacity={0.88} />}
      <rect x={left} y={y - PILL_H / 2} width={w} height={PILL_H} rx={6} fill={tone === 'foil' ? `url(#${foil})` : t.bg} />
      <text x={left + 6} y={y} dominantBaseline="central" fill={t.fg} fontSize={11} fontWeight={tone === 'foil' || tone === 'now' ? 600 : 500}>
        {text}
      </text>
    </g>
  )
}

/* ------------------------------------------------------------------ the picture */

function Picture({ d, w, h, size, plan, focus, markers, animate, label }: { d: Drawing; w: number; h: number; size: Size; plan?: DrawPlan | null; focus?: DrawFocus | null; markers?: DrawMarker[]; animate: boolean; label: string }) {
  const uid = useId().replace(/:/g, '')
  const foil = `foil${uid}`
  const clip = `clip${uid}`
  const g = layout(d, w, h, size, plan, focus)
  const stage = size === 'stage'
  const thumb = size === 'thumb'
  const a = animate
  const at = (ms: number) => (a ? { animationDelay: `${ms}ms` } : undefined)

  // Candles as four paths (wicks and bodies, up and down) to keep the page light.
  let upW = ''
  let dnW = ''
  let upB = ''
  let dnB = ''
  const bw = Math.max(1, g.cw * 0.62)
  g.bars.forEach((k, j) => {
    const cx0 = g.x(g.offset + j)
    const yo = g.y(k.o)
    const yc = g.y(k.c)
    const top = Math.min(yo, yc)
    const bh = Math.max(1, Math.abs(yo - yc))
    const wick = `M${cx0.toFixed(1)} ${g.y(k.h).toFixed(1)}V${g.y(k.l).toFixed(1)}`
    const body = `M${(cx0 - bw / 2).toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${bh.toFixed(1)}h${(-bw).toFixed(1)}Z`
    if (k.c >= k.o) {
      upW += wick
      upB += body
    } else {
      dnW += wick
      dnB += body
    }
  })

  // The level the agent is actually trading stands in for any zone it sits on.
  const near = d.levels.filter(l => g.inRange(l.price) && !(focus && Math.abs(l.price - focus.price) / focus.price < 0.004))
  // A thumbnail keeps only its strongest support and resistance.
  const levels = thumb ? [near.find(l => l.side === 'support'), near.find(l => l.side === 'resistance')].filter((l): l is (typeof near)[number] => l != null) : near
  const trends = d.trends
  const n = g.n
  const valueAt = (t: (typeof trends)[number], i: number) => t.y0 + ((t.y1 - t.y0) * (i - t.from)) / Math.max(1, n - 1 - t.from)
  const lastIdx = n - 1

  // Labels on the left (levels) and on the right (trendlines, the plan, the price now).
  const left: Tag[] = []
  const rightTags: Tag[] = []
  if (!thumb) {
    // Narrow drawings keep only the strongest support and resistance so the candles stay readable.
    const keyOnly = size === 'card' || w < 480
    const shown = keyOnly ? [...levels.filter(l => l.side === 'support').slice(0, 1), ...levels.filter(l => l.side === 'resistance').slice(0, 1)] : levels
    for (const l of shown) left.push({ y: g.y(l.price) - 11, text: `${l.side === 'support' ? 'S' : 'R'} ${px(l.price)} · ${l.touches}×`, tone: l.side === 'support' ? 'up' : 'down', key: `l${l.side}${l.price}` })
    if (focus && g.inRange(focus.price)) left.push({ y: g.y(focus.price) - 11, text: focus.label, tone: 'foil', key: 'focus' })
    if (stage) {
      for (const t of trends) {
        const v = t.y1
        if (!g.inRange(v)) continue
        rightTags.push({ y: g.y(v) + (t.side === 'support' ? 13 : -13), text: `${t.direction === 'rising' ? '↗' : t.direction === 'falling' ? '↘' : '→'} ${t.side} · ${t.touches}×`, tone: t.side === 'support' ? 'up' : 'down', key: `t${t.side}` })
      }
    }
  }
  const planTags: Tag[] = []
  if (g.hasPlan && !thumb) {
    if (plan?.target) planTags.push({ y: g.y(plan.target), text: `Target ${px(plan.target)}`, tone: 'up', key: 'pt' })
    if (plan?.entry) planTags.push({ y: g.y(plan.entry), text: `Entry ${px(plan.entry)}`, tone: 'white', key: 'pe' })
    if (plan?.stop) planTags.push({ y: g.y(plan.stop), text: `Stop ${px(plan.stop)}`, tone: 'down', key: 'ps' })
  }
  const nowTag: Tag | null = !thumb && (stage || g.hasPlan) ? { y: g.y(d.last), text: px(d.last), tone: 'now', key: 'now' } : null
  const leftSpread = spread(left, g.top + PILL_H / 2, g.top + g.priceH - PILL_H / 2)
  const gutter = spread([...planTags, ...(nowTag ? [nowTag] : [])], g.top + PILL_H / 2, g.top + g.priceH - PILL_H / 2)
  const trendSpread = spread(rightTags, g.top + PILL_H / 2, g.top + g.priceH - PILL_H / 2)

  // Where the plan starts: the candle it was made on, or the newest one.
  const planFrom = (() => {
    if (!plan?.from) return g.plotR - g.cw / 2
    const ms = plan.from * 1000
    let idx = lastIdx
    for (let i = lastIdx; i >= 0; i--) {
      if (d.candles[i].ts <= ms) {
        idx = i
        break
      }
    }
    return Math.max(0, g.x(Math.max(idx, g.offset)))
  })()
  const entryY = plan?.entry ? g.y(plan.entry) : g.y(d.last)

  const flowPts = g.flowH
    ? d.flow
        .map((v, i) => (v == null || i < g.offset ? null : `${g.x(i).toFixed(1)},${g.fy(v).toFixed(1)}`))
        .filter(Boolean)
        .join(' ')
    : ''
  // Shade where money flow dipped under 20: the bottoms ParallaxPay buys from.
  const oversold: string[] = []
  if (g.flowH) {
    let run: string[] = []
    const close = () => {
      if (run.length > 1) oversold.push(`M${run[0].split(',')[0]},${g.fy(20).toFixed(1)}L${run.join('L')}L${run[run.length - 1].split(',')[0]},${g.fy(20).toFixed(1)}Z`)
      run = []
    }
    d.flow.forEach((v, i) => {
      if (i < g.offset) return
      if (v != null && v < 20) run.push(`${g.x(i).toFixed(1)},${g.fy(v).toFixed(1)}`)
      else close()
    })
    close()
  }
  const lastFlow = [...d.flow].reverse().find(v => v != null) ?? null

  const marks = (markers ?? [])
    .map(m => {
      const ms = m.at * 1000
      let idx = -1
      for (let i = lastIdx; i >= 0; i--) {
        if (d.candles[i].ts <= ms) {
          idx = i
          break
        }
      }
      return idx >= g.offset ? { ...m, cx: g.x(idx), cy: g.y(m.price) } : null
    })
    .filter((m): m is DrawMarker & { cx: number; cy: number } => m != null && g.inRange(m.price))

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="block absolute inset-0" style={{ fontFamily: 'var(--font-mono)' }}>
      <defs>
        <linearGradient id={foil} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.4" stopColor="#EC4899" />
          <stop offset="0.75" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x={0} y={g.top} width={g.plotR} height={g.priceH} />
        </clipPath>
      </defs>

      {/* grid and price axis */}
      {!thumb &&
        [0.2, 0.4, 0.6, 0.8].map(f => {
          const yy = g.top + g.priceH * f
          const p = g.yMax - (g.yMax - g.yMin) * f
          return (
            <g key={f}>
              <line x1={0} x2={g.plotR} y1={yy} y2={yy} stroke={C.grid} />
              {stage && !g.hasPlan && (
                <text x={w - 4} y={yy} dominantBaseline="central" textAnchor="end" fill={C.axis} fontSize={11}>
                  {px(p)}
                </text>
              )}
            </g>
          )
        })}

      {/* candles print left to right */}
      <g className={a ? 'dr-print' : undefined}>
        <rect x={0} y={g.top} width={g.plotR} height={g.priceH} fill="none" />
        <path d={upW} stroke={C.up} strokeWidth={1} opacity={0.75} fill="none" />
        <path d={dnW} stroke={C.down} strokeWidth={1} opacity={0.75} fill="none" />
        <path d={upB} fill={C.up} />
        <path d={dnB} fill={C.down} />
      </g>

      {/* support and resistance draw across */}
      {levels.map((l, k) => {
        const yy = g.y(l.price)
        const col = l.side === 'support' ? C.up : C.down
        return (
          <g key={`${l.side}${l.price}`} className={cx('dr-lv', a && 'dr-print')} style={at(520 + k * 110)}>
            <rect x={0} y={yy - 6} width={g.plotR} height={12} fill="none" />
            <line x1={0} x2={g.plotR} y1={yy} y2={yy} stroke={col} strokeWidth={stage ? 1.3 : 1} strokeDasharray={thumb ? '3 3' : '6 4'} opacity={thumb ? 0.7 : 0.95} className="dr-ln" />
            {!thumb && <line x1={0} x2={g.plotR} y1={yy} y2={yy} stroke="transparent" strokeWidth={12} style={{ pointerEvents: 'stroke' }} />}
            <title>{`${l.side === 'support' ? 'Support' : 'Resistance'} at ${px(l.price)}: price turned here ${l.touches} times`}</title>
          </g>
        )
      })}

      {/* trendlines extend */}
      <g clipPath={`url(#${clip})`}>
        {trends.map((t, k) => {
          const i0 = Math.max(t.from, g.offset)
          return (
            <line
              key={t.side}
              x1={g.x(i0)}
              y1={g.y(valueAt(t, i0))}
              x2={g.x(lastIdx)}
              y2={g.y(t.y1)}
              stroke={t.side === 'support' ? C.up : C.down}
              strokeWidth={thumb ? 1.2 : 2}
              strokeLinecap="round"
              pathLength={1}
              className={a ? 'dr-draw' : undefined}
              style={a ? { ...at(760 + k * 160), strokeDasharray: '1 1' } : undefined}
            >
              <title>{`${t.direction === 'rising' ? 'Rising' : t.direction === 'falling' ? 'Falling' : 'Flat'} ${t.side} line, touched ${t.touches} times`}</title>
            </line>
          )
        })}
      </g>

      {/* the level it is trading */}
      {focus && g.inRange(focus.price) && (
        <g className={a ? 'dr-print' : undefined} style={at(900)}>
          <rect x={0} y={g.y(focus.price) - 6} width={g.plotR} height={12} fill="none" />
          <line x1={0} x2={g.plotR} y1={g.y(focus.price)} y2={g.y(focus.price)} stroke={`url(#${foil})`} strokeWidth={thumb ? 1.5 : 2.2} />
          <title>{focus.label}</title>
        </g>
      )}

      {/* the plan: target above, stop below, from the candle it was made on */}
      {g.hasPlan && (
        <g className={a ? 'dr-print' : undefined} style={at(1150)}>
          <rect x={planFrom} y={g.top} width={w - planFrom} height={g.priceH} fill="none" />
          {plan?.target && <rect x={planFrom} y={g.y(plan.target)} width={w - planFrom} height={Math.max(1, entryY - g.y(plan.target))} fill={C.up} opacity={0.13} />}
          {plan?.stop && <rect x={planFrom} y={entryY} width={w - planFrom} height={Math.max(1, g.y(plan.stop) - entryY)} fill={C.down} opacity={0.13} />}
          {plan?.target && <line x1={planFrom} x2={w} y1={g.y(plan.target)} y2={g.y(plan.target)} stroke={C.up} strokeWidth={1.4} />}
          {plan?.stop && <line x1={planFrom} x2={w} y1={g.y(plan.stop)} y2={g.y(plan.stop)} stroke={C.down} strokeWidth={1.4} />}
          <line x1={planFrom} x2={w} y1={entryY} y2={entryY} stroke="#FFFFFF" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
        </g>
      )}

      {/* the price now */}
      <line x1={0} x2={g.plotR} y1={g.y(d.last)} y2={g.y(d.last)} stroke={C.now} strokeWidth={1} strokeDasharray="1 3" />
      <circle cx={g.x(lastIdx)} cy={g.y(d.last)} r={thumb ? 5 : 8} fill={`url(#${foil})`} opacity={0.35} className="dr-breathe" />
      <circle cx={g.x(lastIdx)} cy={g.y(d.last)} r={thumb ? 2.2 : 3.4} fill="#FFFFFF" />

      {/* in and out */}
      {marks.map((m, k) => (
        <g key={k} className={a ? 'dr-pop' : undefined} style={at(1300 + k * 80)}>
          <circle cx={m.cx} cy={m.cy} r={5.5} fill={m.tone === 'in' ? '#FFFFFF' : `url(#${foil})`} stroke="#0B0B0C" strokeWidth={2} />
          {!thumb && (
            <text x={m.cx} y={m.cy + (m.tone === 'in' ? 18 : -12)} textAnchor="middle" fill="#FFFFFF" fontSize={11} fontWeight={600}>
              {m.label}
            </text>
          )}
        </g>
      ))}

      {/* labels */}
      {leftSpread.map((t, k) => (
        <Pill key={t.key} x={6} y={t.y} text={t.text} tone={t.tone} foil={foil} delay={1000 + k * 70} animate={a} />
      ))}
      {trendSpread.map((t, k) => (
        <Pill key={t.key} x={g.plotR - 6} y={t.y} text={t.text} tone={t.tone} anchor="end" foil={foil} delay={1200 + k * 70} animate={a} />
      ))}
      {gutter.map((t, k) => (
        <Pill key={t.key} x={w - 2} y={t.y} text={t.text} tone={t.tone} anchor="end" foil={foil} delay={1350 + k * 70} animate={a} />
      ))}

      {/* money flow, with the dips under 20 shaded */}
      {g.flowH > 0 && (
        <g>
          <rect x={0} y={g.flowTop} width={g.plotR} height={g.flowH} fill="rgba(255,255,255,0.025)" rx={4} />
          {[20, 80].map(v => (
            <g key={v}>
              <line x1={0} x2={g.plotR} y1={g.fy(v)} y2={g.fy(v)} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
              {stage && (
                <text x={g.plotR - 4} y={g.fy(v) + (v === 80 ? -7 : 8)} dominantBaseline="central" textAnchor="end" fill={C.axis} fontSize={11}>
                  {v}
                </text>
              )}
            </g>
          ))}
          {oversold.map((p, k) => (
            <path key={k} d={p} fill={C.flow} opacity={0.28} className={a ? 'dr-pop' : undefined} style={at(1500)} />
          ))}
          <polyline points={flowPts} fill="none" stroke={C.flow} strokeWidth={stage ? 1.6 : 1.3} strokeLinejoin="round" pathLength={1} className={a ? 'dr-draw' : undefined} style={a ? { ...at(380), animationDuration: '1100ms', strokeDasharray: '1 1' } : undefined} />
          {stage && (
            <text x={4} y={g.flowTop + 10} dominantBaseline="central" fill={C.axis} fontSize={11}>
              Money flow
            </text>
          )}
          {lastFlow != null && (stage || g.hasPlan) && <Pill x={w - 2} y={g.fy(lastFlow)} text={`MFI ${lastFlow.toFixed(0)}`} tone="flow" anchor="end" foil={foil} delay={1500} animate={a} />}
        </g>
      )}
    </svg>
  )
}
