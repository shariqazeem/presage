'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mfi } from '@/engine/stquant/indicators'
import type { Candle } from '@/lib/market/types'
import { WARMUP, WINDOW, px, readChart, trendAt, type DrawTf, type Drawing, type Level, type Trend } from '@/lib/near/drawing'
import { cx } from '../ui'

/**
 * ParallaxPay's drawing of a coin: the candles it reads, the levels and trendlines it found (every
 * touch marked on the candle it touched), money flow underneath, and, when there is one, its plan.
 * Computed in the browser with the agent's own code (lib/near/drawing.ts) and drawn as plain SVG at
 * the exact size of its box, so it stays sharp and needs no chart library.
 *
 * - On first sight it plays the drawing sequence: candles print, levels draw across, trendlines
 *   extend, money flow traces.
 * - Like a trading terminal, there is room to the right of the last candle. Lines project into it,
 *   their labels sit there instead of on the candles, and a plan's target and stop extend into it.
 * - The stage can be held: pinch, ctrl/⌘-scroll or the buttons zoom, dragging sideways pans,
 *   hovering (or pressing and holding on a phone) shows a candle's numbers, and a double tap fits it
 *   back. The lines stay where the agent drew them; only the view moves.
 */

export type DrawPlan = { entry?: number | null; stop?: number | null; target?: number | null; from?: number | null }
export type DrawMarker = { at: number; price: number; label: string; tone: 'in' | 'out' }
export type DrawFocus = { price: number; label: string }
type Size = 'stage' | 'card' | 'thumb'
/** The candle slot at the right edge of the plot (may run past the last candle) and how many slots fit. */
type View = { end: number; count: number }

const C = { up: '#3DDC84', down: '#FF6B6B', flow: '#A78BFA', grid: 'rgba(255,255,255,0.06)', axis: '#6B6B72', now: 'rgba(255,255,255,0.4)', ink: '#0B0B0C' }
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

/** Every candle the server has for a coin, fetched the first time someone zooms out past the agent's window. */
function useOlderCandles(coin: string, tf: DrawTf, enabled: boolean) {
  return useQuery({
    queryKey: ['near-draw-all', coin, tf],
    queryFn: async () => {
      const r = await fetch(`/api/near/candles?coin=${encodeURIComponent(coin)}&tf=${tf}&all=1`)
      if (!r.ok) throw new Error('No candles')
      return ((await r.json()) as { candles: Candle[] }).candles
    },
    enabled,
    staleTime: 5 * 60_000,
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
  allLevels = false,
  holdable,
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
  /** Every level it found, not only the nearest support and resistance. */
  allLevels?: boolean
  /** Zoom, pan and the crosshair. On by default for the stage. */
  holdable?: boolean
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
  const canHold = holdable ?? size === 'stage'
  const [wantOlder, setWantOlder] = useState(false)
  const { data: all } = useOlderCandles(coin, tf, canHold && wantOlder)
  const older = useMemo(() => {
    if (!drawing || !all?.length) return []
    const first = drawing.candles[0].ts
    return all.filter(k => k.ts < first)
  }, [all, drawing])
  const needOlder = useCallback(() => setWantOlder(true), [])
  return (
    <div ref={box} className={cx('relative', className)}>
      {dim && drawing ? (
        <Picture
          key={`${coin}-${tf}`}
          d={drawing}
          older={older}
          tf={tf}
          w={dim.w}
          h={dim.h}
          size={size}
          plan={plan}
          focus={focus}
          markers={markers}
          animate={animate}
          allLevels={allLevels}
          canHold={canHold}
          onNeedOlder={needOlder}
          label={label ?? `ParallaxPay's ${tf.toUpperCase()} drawing of ${coin}`}
        />
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

type Frame = ReturnType<typeof frameOf>

/** The fixed parts of the layout: gutter, panes, and how much room is left after the last candle. */
function frameOf(w: number, h: number, size: Size, hasPlan: boolean) {
  const stage = size === 'stage'
  const thumb = size === 'thumb'
  const right = thumb ? (hasPlan ? Math.round(w * 0.12) : 3) : hasPlan ? Math.max(96, Math.round(w * 0.18)) : stage ? (w < 480 ? 62 : 74) : 10
  const flowH = thumb ? 0 : Math.round(h * (stage ? 0.2 : 0.18))
  const axisH = stage ? 18 : 0
  const gap = flowH ? (stage ? 12 : 8) : 0
  const top = thumb ? 4 : 12
  const bottom = thumb ? 4 : 6
  const priceH = h - top - bottom - flowH - gap - axisH
  const plotR = w - right
  return {
    w,
    h,
    stage,
    thumb,
    hasPlan,
    right,
    top,
    priceH,
    plotR,
    flowTop: top + priceH + gap,
    flowH,
    axisY: top + priceH + gap + flowH + 13,
    minBar: stage ? 4.6 : size === 'card' ? 3.4 : 2.8,
    /** Share of the plot left empty after the last candle. */
    future: stage ? (w < 480 ? 0.08 : 0.12) : size === 'card' ? 0.06 : 0.02,
  }
}

/** The view that fits the agent's window, with room after the last candle. */
function fitView(n: number, f: Frame): View {
  const slots = Math.max(24, Math.floor(f.plotR / f.minBar))
  const shown = Math.min(n, Math.floor(slots * (1 - f.future)))
  const ahead = Math.max(f.thumb ? 1 : 3, Math.round((shown * f.future) / (1 - f.future)))
  return { end: n - 1 + ahead, count: shown + ahead }
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
  now: { bg: '#FFFFFF', fg: C.ink },
  white: { bg: 'rgba(255,255,255,0.12)', fg: '#FFFFFF' },
}

function Pill({ x, y, text, tone, anchor = 'start', foil, delay, animate }: { x: number; y: number; text: string; tone: Tone; anchor?: 'start' | 'end'; foil: string; delay: number; animate: boolean }) {
  const w = Math.ceil(text.length * CH + 12)
  const left = anchor === 'end' ? x - w : x
  const t = TONE[tone]
  return (
    <g className={animate ? 'dr-pop' : undefined} style={animate ? { animationDelay: `${delay}ms` } : undefined}>
      {tone !== 'foil' && tone !== 'now' && <rect x={left} y={y - PILL_H / 2} width={w} height={PILL_H} rx={6} fill={C.ink} opacity={0.88} />}
      <rect x={left} y={y - PILL_H / 2} width={w} height={PILL_H} rx={6} fill={tone === 'foil' ? `url(#${foil})` : t.bg} />
      <text x={left + 6} y={y} dominantBaseline="central" fill={t.fg} fontSize={11} fontWeight={tone === 'foil' || tone === 'now' ? 600 : 500}>
        {text}
      </text>
    </g>
  )
}

const pillW = (text: string) => Math.ceil(text.length * CH + 12)

function timeLabel(ts: number, tf: DrawTf, withDay: boolean): string {
  const d = new Date(ts)
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (tf === '1d' || tf === '4h') return day
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return withDay ? `${day} ${time}` : time
}

/* ------------------------------------------------------------------ the picture */

/** The drawing itself, for a known size. Exported for the render check (scripts/near/drawings.tsx). */
export function DrawingPicture(props: Parameters<typeof Picture>[0]) {
  return <Picture {...props} />
}

function Picture({
  d,
  older,
  tf,
  w,
  h,
  size,
  plan,
  focus,
  markers,
  animate,
  allLevels,
  canHold,
  onNeedOlder,
  label,
}: {
  d: Drawing
  older: Candle[]
  tf: DrawTf
  w: number
  h: number
  size: Size
  plan?: DrawPlan | null
  focus?: DrawFocus | null
  markers?: DrawMarker[]
  animate: boolean
  allLevels: boolean
  canHold: boolean
  onNeedOlder: () => void
  label: string
}) {
  const uid = useId().replace(/:/g, '')
  const foil = `foil${uid}`
  const clip = `clip${uid}`
  const hasPlan = Boolean(plan && (plan.stop || plan.target))
  const f = frameOf(w, h, size, hasPlan)
  const n = d.candles.length
  const lastIdx = n - 1
  const fit = useMemo(() => fitView(n, f), [n, f.plotR, f.minBar, f.future, f.thumb]) // eslint-disable-line react-hooks/exhaustive-deps
  const [held, setHeld] = useState<View | null>(null)
  const view = held ?? fit
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null)
  const a = animate
  const at = (ms: number) => (a ? { animationDelay: `${ms}ms` } : undefined)
  const stage = f.stage
  const thumb = f.thumb
  const wide = stage && w >= 560

  // Older candles, before the agent's window, get negative indexes.
  const first = -older.length
  const candleAt = (i: number): Candle | undefined => (i >= 0 ? d.candles[i] : older[older.length + i])
  const flowAll = useMemo(() => {
    if (!older.length) return null
    const m = mfi([...older, ...d.candles])
    return m ? m.slice(0, older.length) : null
  }, [older, d.candles])
  const flowAt = (i: number): number | null => (i >= 0 ? d.flow[i] ?? null : flowAll?.[older.length + i] ?? null)

  // Geometry for this view.
  const cw = f.plotR / view.count
  const x = (i: number) => f.plotR - (view.end - i + 0.5) * cw
  const iAt = (px0: number) => Math.round(view.end + 0.5 - (f.plotR - px0) / cw)
  const lo0 = Math.max(first, Math.ceil(view.end - view.count + 0.5))
  const hi0 = Math.min(lastIdx, Math.floor(view.end))
  let hi = -Infinity
  let lo = Infinity
  for (let i = lo0; i <= hi0; i++) {
    const k = candleAt(i)
    if (!k) continue
    if (k.h > hi) hi = k.h
    if (k.l < lo) lo = k.l
  }
  if (!Number.isFinite(hi)) {
    hi = d.last * 1.01
    lo = d.last * 0.99
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
  const y = (p: number) => f.top + f.priceH * (1 - (p - yMin) / (yMax - yMin))
  const inRange = (p: number) => p >= yMin && p <= yMax
  /** The candle at `i` is in view. */
  const seen = (i: number) => i >= lo0 && i <= hi0
  const fy = (v: number) => f.flowTop + f.flowH * (1 - v / 100)

  // Candles as four paths (wicks and bodies, up and down) to keep the page light.
  let upW = ''
  let dnW = ''
  let upB = ''
  let dnB = ''
  const bw = Math.max(1, cw * 0.62)
  for (let i = lo0; i <= hi0; i++) {
    const k = candleAt(i)
    if (!k) continue
    const cx0 = x(i)
    const yo = y(k.o)
    const yc = y(k.c)
    const top = Math.min(yo, yc)
    const bh = Math.max(1, Math.abs(yo - yc))
    const wick = `M${cx0.toFixed(1)} ${y(k.h).toFixed(1)}V${y(k.l).toFixed(1)}`
    const body = `M${(cx0 - bw / 2).toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${bh.toFixed(1)}h${(-bw).toFixed(1)}Z`
    if (k.c >= k.o) {
      upW += wick
      upB += body
    } else {
      dnW += wick
      dnB += body
    }
  }

  // Which levels to draw: the nearest support and resistance (or all of them), never one the level it
  // is trading already stands for.
  const covered = (p: number) => focus != null && Math.abs(p - focus.price) / focus.price < Math.max(0.004, d.bar * 0.5)
  const levels = d.levels
    .filter(l => (allLevels && !thumb ? true : l.key) && !covered(l.price) && inRange(l.price))
    .slice(0, allLevels ? 6 : 2)
  // Trendlines that are on the chart where price is now.
  const trends = d.trends.filter(t => {
    const v = trendAt(t, lastIdx)
    return v > yMin - (yMax - yMin) * 0.15 && v < yMax + (yMax - yMin) * 0.15
  })

  // Labels: on a wide stage they sit in the room after the last candle, otherwise level prices go
  // on the axis. Trendline labels and the plan always say what they are.
  const endX = f.plotR - 6
  const inPlot: Tag[] = []
  const gutterTags: Tag[] = []
  const levelText = (l: Level) => `${l.role === 'support' ? 'S' : 'R'} ${px(l.price)} · ${l.touches}×`
  if (!thumb && stage) {
    for (const l of levels) {
      const tone = l.role === 'support' ? 'up' : 'down'
      if (wide) inPlot.push({ y: y(l.price) - 11, text: levelText(l), tone, key: `l${l.price}` })
      else if (l.key) gutterTags.push({ y: y(l.price), text: px(l.price), tone, key: `l${l.price}` })
    }
    if (focus && inRange(focus.price)) {
      if (wide) inPlot.push({ y: y(focus.price) - 11, text: focus.label, tone: 'foil', key: 'focus' })
      else gutterTags.push({ y: y(focus.price), text: px(focus.price), tone: 'foil', key: 'focus' })
    }
    for (const t of trends) {
      const v = trendAt(t, iAt(f.plotR))
      if (!inRange(v)) continue
      const arrow = t.direction === 'rising' ? '↗' : t.direction === 'falling' ? '↘' : '→'
      inPlot.push({ y: y(v) + (t.side === 'support' ? 13 : -13), text: wide ? `${arrow} ${t.side} · ${t.touches}×` : `${arrow} ${t.touches}×`, tone: t.side === 'support' ? 'up' : 'down', key: `t${t.side}` })
    }
  } else if (!thumb && focus && inRange(focus.price) && size === 'card') {
    inPlot.push({ y: y(focus.price) - 11, text: focus.label, tone: 'foil', key: 'focus' })
  }
  if (hasPlan && !thumb) {
    if (plan?.target) gutterTags.push({ y: y(plan.target), text: `Target ${px(plan.target)}`, tone: 'up', key: 'pt' })
    if (plan?.entry) gutterTags.push({ y: y(plan.entry), text: `Entry ${px(plan.entry)}`, tone: 'white', key: 'pe' })
    if (plan?.stop) gutterTags.push({ y: y(plan.stop), text: `Stop ${px(plan.stop)}`, tone: 'down', key: 'ps' })
  }
  if (!thumb && (stage || hasPlan)) gutterTags.push({ y: y(d.last), text: px(d.last), tone: 'now', key: 'now' })
  const rangeMin = f.top + PILL_H / 2
  const rangeMax = f.top + f.priceH - PILL_H / 2
  const plotTags = spread(inPlot, rangeMin, rangeMax)
  const gutter = spread(gutterTags, rangeMin, rangeMax)
  const gutterX = hasPlan ? w - 2 : w - 2

  // Axis prices, left out where a tag already sits.
  const axis =
    stage && !hasPlan
      ? [0.12, 0.34, 0.56, 0.78]
          .map(fr => ({ yy: f.top + f.priceH * fr, p: yMax - (yMax - yMin) * fr }))
          .filter(t => !gutter.some(g => Math.abs(g.y - t.yy) < PILL_H))
      : []

  // Where the plan starts: the candle it was made on, or the newest one.
  const planX = (() => {
    if (!plan?.from) return x(lastIdx)
    const ms = plan.from * 1000
    for (let i = lastIdx; i >= first; i--) {
      const k = candleAt(i)
      if (k && k.ts <= ms) return Math.max(0, x(i))
    }
    return Math.max(0, x(first))
  })()
  const entryY = plan?.entry ? y(plan.entry) : y(d.last)

  // Money flow for the candles in view, with the dips under 20 shaded.
  const flowPts: string[] = []
  const oversold: string[] = []
  if (f.flowH) {
    let run: string[] = []
    const close = () => {
      if (run.length > 1) oversold.push(`M${run[0].split(',')[0]},${fy(20).toFixed(1)}L${run.join('L')}L${run[run.length - 1].split(',')[0]},${fy(20).toFixed(1)}Z`)
      run = []
    }
    for (let i = lo0; i <= hi0; i++) {
      const v = flowAt(i)
      if (v == null) {
        close()
        continue
      }
      const pt = `${x(i).toFixed(1)},${fy(v).toFixed(1)}`
      flowPts.push(pt)
      if (v < 20) run.push(pt)
      else close()
    }
    close()
  }
  const lastFlow = [...d.flow].reverse().find(v => v != null) ?? null

  const marks = (markers ?? [])
    .map(m => {
      const ms = m.at * 1000
      for (let i = lastIdx; i >= first; i--) {
        const k = candleAt(i)
        if (k && k.ts <= ms) return i >= lo0 ? { ...m, cx: x(i), cy: y(m.price) } : null
      }
      return null
    })
    .filter((m): m is DrawMarker & { cx: number; cy: number } => m != null && inRange(m.price))

  // Time along the bottom of the stage.
  const times: { x: number; text: string }[] = []
  if (f.axisY && stage) {
    const step = Math.max(1, Math.ceil((view.count * 92) / f.plotR))
    let lastDay = ''
    for (let i = Math.ceil(lo0 / step) * step; i <= hi0; i += step) {
      const k = candleAt(i)
      if (!k) continue
      const day = new Date(k.ts).toDateString()
      const xx = x(i)
      if (xx < 24 || xx > f.plotR - 24) continue
      times.push({ x: xx, text: timeLabel(k.ts, tf, day !== lastDay) })
      lastDay = day
    }
  }

  /* ---------------------------------------------------------------- holding it */

  const svgRef = useRef<SVGSVGElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const pending = useRef<View | null>(null)
  const raf = useRef(0)
  const limits = useRef({ first, lastIdx, fit, plotR: f.plotR })
  limits.current = { first, lastIdx, fit, plotR: f.plotR }

  const commit = useCallback(
    (next: View) => {
      const L = limits.current
      const ahead = L.fit.end - L.lastIdx
      const total = L.lastIdx - L.first + 1
      const count = Math.min(Math.max(next.count, 20), Math.max(L.fit.count, (total + ahead) * 1.1))
      const end = Math.min(Math.max(next.end, L.first + count * 0.35), L.lastIdx + count * 0.6)
      if (end - count < L.first + 5) onNeedOlder()
      pending.current = { end, count }
      if (!raf.current)
        raf.current = requestAnimationFrame(() => {
          raf.current = 0
          if (pending.current) setHeld(pending.current)
        })
    },
    [onNeedOlder],
  )
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /** Zoom by `factor` (>1 zooms out) keeping the candle under `atX` where it is. */
  const zoom = useCallback(
    (factor: number, atX: number) => {
      if (factor > 1) onNeedOlder()
      const v = pending.current ?? viewRef.current
      const L = limits.current
      const slot = v.end + 0.5 - (L.plotR - atX) / (L.plotR / v.count)
      const count = v.count * factor
      const end = slot - 0.5 + (L.plotR - atX) / (L.plotR / count)
      commit({ end, count })
    },
    [commit, onNeedOlder],
  )
  const pan = useCallback(
    (dx: number) => {
      const v = pending.current ?? viewRef.current
      commit({ end: v.end - dx / (limits.current.plotR / v.count), count: v.count })
    },
    [commit],
  )
  const reset = useCallback(() => {
    pending.current = null
    setHeld(null)
  }, [])

  // Pinch on a trackpad (or ctrl/⌘ + scroll) zooms; a sideways swipe pans. A plain scroll keeps
  // scrolling the page, so the chart never traps someone reading down it.
  useEffect(() => {
    const el = svgRef.current
    if (!el || !canHold) return
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect()
      const px0 = e.clientX - rect.left
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoom(Math.exp(Math.max(-40, Math.min(40, e.deltaY)) * 0.012), Math.min(px0, limits.current.plotR))
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) {
        e.preventDefault()
        pan(-e.deltaX)
      }
    }
    // While panning, pinching or holding the crosshair, a finger on the chart doesn't scroll the page.
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current.mode !== 'idle') e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [canHold, zoom, pan])

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ mode: 'idle' | 'pan' | 'cross' | 'pinch'; startX: number; startY: number; lastX: number; dist: number; timer: number }>({ mode: 'idle', startX: 0, startY: 0, lastX: 0, dist: 0, timer: 0 })
  const local = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!canHold) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    window.clearTimeout(g.timer)
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      g.mode = 'pinch'
      g.dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      setCross(null)
      return
    }
    g.mode = 'idle'
    g.startX = g.lastX = p.x
    g.startY = p.y
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      g.mode = 'pan'
      svgRef.current?.setPointerCapture(e.pointerId)
    } else {
      // Press and hold for the crosshair; slide sideways to pan.
      g.timer = window.setTimeout(() => {
        if (gesture.current.mode === 'idle') {
          gesture.current.mode = 'cross'
          setCross(p)
        }
      }, 320)
    }
  }
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!canHold) return
    const p = local(e)
    const g = gesture.current
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p)
    if (g.mode === 'pinch' && pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      if (g.dist > 0 && dist > 0) zoom(g.dist / dist, Math.min((p1.x + p2.x) / 2, f.plotR))
      g.dist = dist
      return
    }
    if (g.mode === 'cross') {
      setCross(p)
      return
    }
    if (g.mode === 'idle' && pointers.current.has(e.pointerId) && e.pointerType !== 'mouse') {
      if (Math.abs(p.x - g.startX) > 8 && Math.abs(p.x - g.startX) > Math.abs(p.y - g.startY)) {
        window.clearTimeout(g.timer)
        g.mode = 'pan'
        svgRef.current?.setPointerCapture(e.pointerId)
      }
    }
    if (g.mode === 'pan' && pointers.current.has(e.pointerId)) {
      pan(p.x - g.lastX)
      g.lastX = p.x
      if (e.pointerType === 'mouse' && Math.abs(p.x - g.startX) > 3) setCross(null)
      return
    }
    if (e.pointerType === 'mouse') setCross(p)
  }
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    window.clearTimeout(g.timer)
    if (g.mode === 'cross' && e.pointerType !== 'mouse') setCross(null)
    g.mode = 'idle'
    const rest = [...pointers.current.values()][0]
    if (rest) g.startX = g.lastX = rest.x
  }
  const onPointerLeave = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && gesture.current.mode !== 'pan') setCross(null)
  }

  // The crosshair's candle.
  const crossInfo = (() => {
    if (!cross || cross.x > f.plotR) return null
    const i = iAt(cross.x)
    const k = candleAt(i)
    if (!k || i < lo0 || i > hi0) return null
    const mf = flowAt(i)
    const price = yMax - ((cross.y - f.top) / f.priceH) * (yMax - yMin)
    return { i, k, mf, price, inPrice: cross.y >= f.top && cross.y <= f.top + f.priceH }
  })()

  const zoomed = held != null && (Math.abs(held.count - fit.count) > 0.5 || Math.abs(held.end - fit.end) > 0.5)

  return (
    <>
      <svg
        ref={svgRef}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={label}
        className={cx('block absolute inset-0 select-none', canHold && 'cursor-crosshair')}
        style={{ fontFamily: 'var(--font-mono)', touchAction: canHold ? 'pan-y' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={canHold ? reset : undefined}
      >
        <defs>
          <linearGradient id={foil} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.4" stopColor="#EC4899" />
            <stop offset="0.75" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
          {/* A flat line has no height, so a gradient sized to its own box paints nothing: lines use one sized to the plot. */}
          <linearGradient id={`${foil}l`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={f.plotR} y2={0}>
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.4" stopColor="#EC4899" />
            <stop offset="0.75" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
          <clipPath id={clip}>
            <rect x={0} y={f.top} width={f.plotR} height={f.priceH} />
          </clipPath>
          <clipPath id={`${clip}f`}>
            <rect x={0} y={f.flowTop} width={f.plotR} height={f.flowH} />
          </clipPath>
        </defs>

        {/* grid and price axis */}
        {!thumb &&
          [0.12, 0.34, 0.56, 0.78].map(fr => {
            const yy = f.top + f.priceH * fr
            return <line key={fr} x1={0} x2={f.plotR} y1={yy} y2={yy} stroke={C.grid} />
          })}
        {axis.map(t => (
          <text key={t.yy} x={w - 4} y={t.yy} dominantBaseline="central" textAnchor="end" fill={C.axis} fontSize={11}>
            {px(t.p)}
          </text>
        ))}

        <g clipPath={`url(#${clip})`}>
          {/* candles print left to right */}
          <g className={a ? 'dr-print' : undefined}>
            <rect x={0} y={f.top} width={f.plotR} height={f.priceH} fill="none" />
            <path d={upW} stroke={C.up} strokeWidth={1} opacity={0.75} fill="none" />
            <path d={dnW} stroke={C.down} strokeWidth={1} opacity={0.75} fill="none" />
            <path d={upB} fill={C.up} />
            <path d={dnB} fill={C.down} />
          </g>

          {/* levels: from their first touch, across, and on into the room ahead; each touch ringed */}
          {levels.map((l, k) => {
            const yy = y(l.price)
            const col = l.role === 'support' ? C.up : C.down
            const x0 = Math.max(0, x(l.first) - cw / 2)
            const band = Math.max(2, Math.abs(y(l.lo) - y(l.hi)))
            const strong = l.key || !allLevels
            return (
              <g key={`${l.role}${l.price}`} className={cx('dr-lv', a && 'dr-print')} style={at(520 + k * 110)}>
                <rect x={0} y={yy - 7} width={f.plotR} height={14} fill="none" />
                {!thumb && <rect x={x0} y={yy - band / 2} width={f.plotR - x0} height={band} fill={col} opacity={strong ? 0.09 : 0.05} />}
                <line x1={x0} x2={f.plotR} y1={yy} y2={yy} stroke={col} strokeWidth={stage ? 1.3 : 1} strokeDasharray={thumb ? '3 3' : '6 4'} opacity={thumb ? 0.7 : strong ? 0.95 : 0.55} className="dr-ln" />
                {stage &&
                  strong &&
                  l.points
                    .filter(p => seen(p.i))
                    .map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.price)} r={3.2} fill={C.ink} stroke={col} strokeWidth={1.4} />)}
                {!thumb && <line x1={x0} x2={f.plotR} y1={yy} y2={yy} stroke="transparent" strokeWidth={12} style={{ pointerEvents: 'stroke' }} />}
                <title>{`${l.role === 'support' ? 'Support' : 'Resistance'} at ${px(l.price)}: price turned here ${l.touches} times${l.flipped ? ', from above and below' : ''}`}</title>
              </g>
            )
          })}

          {/* trendlines extend, projected past the last candle; each touch ringed */}
          {trends.map((t, k) => {
            const col = t.side === 'support' ? C.up : C.down
            const i0 = t.from
            const i1 = iAt(f.plotR) + 1
            return (
              <g key={t.side}>
                <line
                  x1={x(i0)}
                  y1={y(trendAt(t, i0))}
                  x2={x(i1)}
                  y2={y(trendAt(t, i1))}
                  stroke={col}
                  strokeWidth={thumb ? 1.2 : 2}
                  strokeLinecap="round"
                  pathLength={1}
                  className={a ? 'dr-draw' : undefined}
                  style={a ? { ...at(760 + k * 160), strokeDasharray: '1 1' } : undefined}
                >
                  <title>{`${t.direction === 'rising' ? 'Rising' : t.direction === 'falling' ? 'Falling' : 'Flat'} ${t.side} line, touched ${t.touches} times`}</title>
                </line>
                {!thumb && t.touchIdx.some(seen) && (
                  <g className={a ? 'dr-pop' : undefined} style={at(1000 + k * 160)}>
                    {t.touchIdx.filter(seen).map(i => (
                      <circle key={i} cx={x(i)} cy={y(trendAt(t, i))} r={stage ? (t.touches > 6 ? 2.7 : 3.2) : 2.4} fill={C.ink} stroke={col} strokeWidth={1.4} />
                    ))}
                  </g>
                )}
              </g>
            )
          })}

          {/* the level it is trading */}
          {focus && inRange(focus.price) && (
            <g className={a ? 'dr-print' : undefined} style={at(900)}>
              <rect x={0} y={y(focus.price) - 6} width={f.plotR} height={12} fill="none" />
              <line x1={0} x2={f.plotR} y1={y(focus.price)} y2={y(focus.price)} stroke={`url(#${foil}l)`} strokeWidth={thumb ? 1.5 : 2.2} />
              <title>{focus.label}</title>
            </g>
          )}
        </g>

        {/* the plan: target above, stop below, from the candle it was made on into the room ahead */}
        {hasPlan && (
          <g className={a ? 'dr-print' : undefined} style={at(1150)}>
            <rect x={planX} y={f.top} width={w - planX} height={f.priceH} fill="none" />
            {plan?.target && <rect x={planX} y={y(plan.target)} width={f.plotR - planX} height={Math.max(1, entryY - y(plan.target))} fill={C.up} opacity={0.13} />}
            {plan?.stop && <rect x={planX} y={entryY} width={f.plotR - planX} height={Math.max(1, y(plan.stop) - entryY)} fill={C.down} opacity={0.13} />}
            {plan?.target && <line x1={planX} x2={w} y1={y(plan.target)} y2={y(plan.target)} stroke={C.up} strokeWidth={1.4} />}
            {plan?.stop && <line x1={planX} x2={w} y1={y(plan.stop)} y2={y(plan.stop)} stroke={C.down} strokeWidth={1.4} />}
            <line x1={planX} x2={w} y1={entryY} y2={entryY} stroke="#FFFFFF" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
          </g>
        )}

        {/* the price now */}
        <line x1={0} x2={f.plotR} y1={y(d.last)} y2={y(d.last)} stroke={C.now} strokeWidth={1} strokeDasharray="1 3" />
        {x(lastIdx) <= f.plotR && (
          <>
            <circle cx={x(lastIdx)} cy={y(d.last)} r={thumb ? 5 : 8} fill={`url(#${foil})`} opacity={0.35} className="dr-breathe" />
            <circle cx={x(lastIdx)} cy={y(d.last)} r={thumb ? 2.2 : 3.4} fill="#FFFFFF" />
          </>
        )}

        {/* in and out */}
        {marks.map((m, k) => (
          <g key={k} className={a ? 'dr-pop' : undefined} style={at(1300 + k * 80)}>
            <circle cx={m.cx} cy={m.cy} r={5.5} fill={m.tone === 'in' ? '#FFFFFF' : `url(#${foil})`} stroke={C.ink} strokeWidth={2} />
            {!thumb && (
              <text x={m.cx} y={m.cy + (m.tone === 'in' ? 18 : -12)} textAnchor="middle" fill="#FFFFFF" fontSize={11} fontWeight={600}>
                {m.label}
              </text>
            )}
          </g>
        ))}

        {/* labels */}
        {plotTags.map((t, k) => (
          <Pill key={t.key} x={endX} y={t.y} text={t.text} tone={t.tone} anchor="end" foil={foil} delay={1100 + k * 70} animate={a} />
        ))}
        {gutter.map((t, k) => (
          <Pill key={t.key} x={gutterX} y={t.y} text={t.text} tone={t.tone} anchor="end" foil={foil} delay={1350 + k * 70} animate={a} />
        ))}

        {/* money flow, with the dips under 20 shaded */}
        {f.flowH > 0 && (
          <g>
            <rect x={0} y={f.flowTop} width={f.plotR} height={f.flowH} fill="rgba(255,255,255,0.025)" rx={4} />
            {[20, 80].map(v => (
              <g key={v}>
                <line x1={0} x2={f.plotR} y1={fy(v)} y2={fy(v)} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                {stage && (lastFlow == null || Math.abs(fy(lastFlow) - fy(v)) > PILL_H) && (
                  <text x={f.plotR + 6} y={fy(v)} dominantBaseline="central" fill={C.axis} fontSize={11}>
                    {v}
                  </text>
                )}
              </g>
            ))}
            <g clipPath={`url(#${clip}f)`}>
              {oversold.map((p, k) => (
                <path key={k} d={p} fill={C.flow} opacity={0.28} className={a ? 'dr-pop' : undefined} style={at(1500)} />
              ))}
              <polyline points={flowPts.join(' ')} fill="none" stroke={C.flow} strokeWidth={stage ? 1.6 : 1.3} strokeLinejoin="round" pathLength={1} className={a ? 'dr-draw' : undefined} style={a ? { ...at(380), animationDuration: '1100ms', strokeDasharray: '1 1' } : undefined} />
            </g>
            {stage && (
              <text x={4} y={f.flowTop + 10} dominantBaseline="central" fill={C.axis} fontSize={11}>
                Money flow
              </text>
            )}
            {lastFlow != null && (stage || hasPlan) && <Pill x={w - 2} y={Math.min(Math.max(fy(lastFlow), f.flowTop + PILL_H / 2), f.flowTop + f.flowH - PILL_H / 2)} text={`MFI ${lastFlow.toFixed(0)}`} tone="flow" anchor="end" foil={foil} delay={1500} animate={a} />}
          </g>
        )}

        {/* time */}
        {times.map(t => (
          <text key={t.x} x={t.x} y={f.axisY} textAnchor="middle" fill={C.axis} fontSize={11}>
            {t.text}
          </text>
        ))}

        {/* the crosshair */}
        {crossInfo && (
          <g pointerEvents="none">
            <line x1={x(crossInfo.i)} x2={x(crossInfo.i)} y1={f.top} y2={f.flowTop + f.flowH} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
            {crossInfo.inPrice && cross && <line x1={0} x2={f.plotR} y1={cross.y} y2={cross.y} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />}
            {crossInfo.inPrice && cross && <Pill x={w - 2} y={cross.y} text={px(crossInfo.price)} tone="white" anchor="end" foil={foil} delay={0} animate={false} />}
            <CrossReadout k={crossInfo.k} mf={crossInfo.mf} tf={tf} w={f.plotR} y={f.top + 2} />
          </g>
        )}
      </svg>

      {/* zoom controls */}
      {canHold && !thumb && (
        <div className="absolute flex items-center gap-1" style={{ left: 8, top: f.top + f.priceH - 38 }}>
          <ChartButton label="Zoom out" onClick={() => zoom(1.4, x(lastIdx))}>
            −
          </ChartButton>
          <ChartButton label="Zoom in" onClick={() => zoom(1 / 1.4, x(lastIdx))}>
            +
          </ChartButton>
          {zoomed && (
            <ChartButton label="Fit the chart" onClick={reset} wide>
              Fit
            </ChartButton>
          )}
        </div>
      )}
    </>
  )
}

function ChartButton({ children, label, onClick, wide }: { children: React.ReactNode; label: string; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx('h-7 rounded-[9px] bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 text-white/80 text-[14px] leading-none grid place-items-center backdrop-blur transition', wide ? 'px-2.5 text-[12px] font-medium' : 'w-7')}
    >
      {children}
    </button>
  )
}

function CrossReadout({ k, mf, tf, w, y }: { k: Candle; mf: number | null; tf: DrawTf; w: number; y: number }) {
  const parts = [timeLabel(k.ts, tf, true), `O ${px(k.o)}`, `H ${px(k.h)}`, `L ${px(k.l)}`, `C ${px(k.c)}`, ...(mf != null ? [`MFI ${mf.toFixed(0)}`] : [])]
  const text = parts.join('  ')
  const tw = pillW(text)
  const lines = tw > w - 12 ? [parts.slice(0, 1).concat(parts.slice(4)).join('  '), parts.slice(1, 4).join('  ')] : [text]
  const bw = Math.max(...lines.map(pillW))
  return (
    <g>
      <rect x={6} y={y} width={bw} height={lines.length * 16 + 6} rx={7} fill={C.ink} opacity={0.9} />
      {lines.map((l, j) => (
        <text key={j} x={12} y={y + 12 + j * 16} dominantBaseline="central" fill="#FFFFFF" fontSize={11}>
          {l}
        </text>
      ))}
    </g>
  )
}
