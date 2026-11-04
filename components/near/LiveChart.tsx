'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '../ui'

type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number }
export type ChartTf = '15m' | '1h' | '4h' | '1d'

/** MFI(14) from typical price and volume, the momentum gauge ParallaxPay buys at the bottom of. */
function mfi(c: Candle[], n = 14): (number | null)[] {
  const tp = c.map(k => (k.h + k.l + k.c) / 3)
  return c.map((_, i) => {
    if (i < n) return null
    let pos = 0
    let neg = 0
    for (let j = i - n + 1; j <= i; j++) {
      const flow = tp[j] * c[j].v
      if (tp[j] > tp[j - 1]) pos += flow
      else if (tp[j] < tp[j - 1]) neg += flow
    }
    return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg)
  })
}

const THEMES = {
  dark: { text: '#8A8A92', grid: '#1C1C1F', border: '#26262A', up: '#3DDC84', down: '#FF6B6B', mfi: '#B388FF', ink: '#FFFFFF' },
  light: { text: '#3F3F46', grid: '#F1F1EE', border: '#E6E6E3', up: '#12A150', down: '#E5484D', mfi: '#7C3AED', ink: '#0B0B0C' },
}

export type ChartLevels = {
  support?: number | null
  r1?: number | null
  r2?: number | null
  entry?: number | null
  stop?: number | null
  target?: number | null
  exit?: number | null
}

/**
 * Candles with the levels ParallaxPay drew, and MFI underneath: the same picture it reads, live.
 * Lines are only drawn where they fall near the visible range, so a far target doesn't flatten the chart.
 */
export function LiveChart({
  coin,
  tf,
  levels,
  height = 300,
  theme = 'dark',
  markers,
  refreshMs = 30_000,
}: {
  /** The coin's symbol, e.g. NEAR. */
  coin: string
  tf: ChartTf
  levels: ChartLevels
  height?: number
  theme?: 'dark' | 'light'
  markers?: { ts: number; text: string; below?: boolean }[]
  refreshMs?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const lv = JSON.stringify(levels)
  const mk = JSON.stringify(markers ?? [])

  useEffect(() => {
    if (!ref.current) return
    let disposed = false
    let chart: { remove: () => void } | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    const t = THEMES[theme]
    ;(async () => {
      try {
        const { createChart, CandlestickSeries, LineSeries, LineStyle, createSeriesMarkers } = await import('lightweight-charts')
        const load = async () => {
          const r = await fetch(`/api/near/candles?coin=${coin}&tf=${tf}`)
          if (!r.ok) throw new Error('Candles unavailable')
          return ((await r.json()) as { candles: Candle[] }).candles
        }
        const candles = await load()
        if (disposed || !ref.current) return
        const ch = createChart(ref.current, {
          height,
          autoSize: true,
          layout: { textColor: t.text, background: { color: 'transparent' }, fontFamily: 'IBM Plex Mono', fontSize: 10, attributionLogo: false },
          grid: { horzLines: { color: t.grid }, vertLines: { visible: false } },
          timeScale: { timeVisible: tf === '15m' || tf === '1h', borderColor: t.border, rightOffset: 4 },
          rightPriceScale: { borderColor: t.border },
          crosshair: { horzLine: { color: t.text }, vertLine: { color: t.text } },
        })
        chart = ch
        const candlesSeries = ch.addSeries(CandlestickSeries, { upColor: t.up, downColor: t.down, borderVisible: false, wickUpColor: t.up, wickDownColor: t.down })
        const mfiSeries = ch.addSeries(LineSeries, { color: t.mfi, lineWidth: 2, priceLineVisible: false, lastValueVisible: true }, 1)
        try {
          ch.panes()[1]?.setHeight(Math.round(height * 0.26))
        } catch {
          // older layouts keep the default split
        }
        const put = (cs: Candle[]) => {
          candlesSeries.setData(cs.map(k => ({ time: (k.ts / 1000) as never, open: k.o, high: k.h, low: k.l, close: k.c })))
          const m = mfi(cs)
          mfiSeries.setData(cs.flatMap((k, i) => (m[i] == null ? [] : [{ time: (k.ts / 1000) as never, value: m[i]! }])))
        }
        put(candles)
        mfiSeries.createPriceLine({ price: 20, color: t.up, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
        mfiSeries.createPriceLine({ price: 80, color: t.down, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })

        const lo = Math.min(...candles.slice(-120).map(k => k.l))
        const hi = Math.max(...candles.slice(-120).map(k => k.h))
        const near = (p: number) => p > lo * 0.9 && p < hi * 1.12
        const L = JSON.parse(lv) as ChartLevels
        const line = (price: number | null | undefined, color: string, title: string, style: number) => {
          if (price != null && near(price)) candlesSeries.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title })
        }
        line(L.support, t.up, 'support', LineStyle.Dashed)
        line(L.r1, t.down, 'R1', LineStyle.Dashed)
        line(L.r2, t.down, 'R2', LineStyle.Dashed)
        line(L.entry, t.ink, 'entry', LineStyle.Solid)
        line(L.stop, t.down, 'stop', LineStyle.Solid)
        line(L.target, t.up, 'target', LineStyle.Solid)
        line(L.exit, t.ink, 'exit', LineStyle.Dotted)
        const M = JSON.parse(mk) as { ts: number; text: string; below?: boolean }[]
        if (M.length) {
          const bar = { '15m': 900, '1h': 3600, '4h': 14_400, '1d': 86_400 }[tf]
          createSeriesMarkers(
            candlesSeries,
            M.map(m => ({ time: (Math.floor(m.ts / bar) * bar) as never, position: m.below ? ('belowBar' as const) : ('aboveBar' as const), color: '#EC4899', shape: m.below ? ('arrowUp' as const) : ('arrowDown' as const), text: m.text })).sort((a, b) => Number(a.time) - Number(b.time)),
          )
        }
        ch.timeScale().fitContent()
        setReady(true)
        if (refreshMs > 0) timer = setInterval(async () => put(await load().catch(() => candles)), refreshMs)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Chart unavailable')
      }
    })()
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
      chart?.remove()
    }
  }, [coin, tf, lv, mk, height, theme, refreshMs])

  return (
    <div className="relative" style={{ height }}>
      {!ready && !err && <div className={cx('absolute inset-0 rounded-[12px] animate-pulse', theme === 'dark' ? 'bg-white/[0.04]' : 'bg-paper-2')} />}
      {err && <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">{err}</div>}
      <div ref={ref} className="absolute inset-0" />
    </div>
  )
}

export function TfTabs({ tf, onChange, dark = true }: { tf: ChartTf; onChange: (t: ChartTf) => void; dark?: boolean }) {
  return (
    <div className={cx('inline-flex rounded-full p-0.5', dark ? 'bg-white/[0.07]' : 'bg-paper-2')}>
      {(['15m', '1h', '4h', '1d'] as ChartTf[]).map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cx('h-7 px-3 rounded-full num text-[11.5px] transition-colors', t === tf ? (dark ? 'bg-white text-ink' : 'bg-ink text-white') : dark ? 'text-[#8A8A92] hover:text-white' : 'text-ink-3 hover:text-ink')}
        >
          {t.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
