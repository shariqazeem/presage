export const short = (a?: string | null, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : '')

export const usd6 = (v: number) => `$${(v / 1e6).toFixed(v % 1_000_000 === 0 ? 0 : 2)}`

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)

/** Setup results are hundredths of R. */
export const rMultiple = (hundredths: number | null | undefined) =>
  hundredths == null ? '—' : `${hundredths >= 0 ? '+' : '−'}${Math.abs(hundredths / 100).toFixed(2)}R`

/** Direction results are basis points in the called direction. */
export const bps = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v / 100).toFixed(2)}%`)

export const result = (kind: 'setup' | 'direction', v: number | null | undefined) => (kind === 'setup' ? rMultiple(v) : bps(v))

export function price(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return Number(p.toPrecision(5)).toString()
}

export function ago(sec: number | null | undefined): string {
  if (!sec) return '—'
  const d = Math.floor(Date.now() / 1000) - sec
  if (d < 0) return `in ${until(sec)}`
  if (d < 60) return `${d}s ago`
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86_400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86_400)}d ago`
}

export function until(sec: number): string {
  const d = sec - Math.floor(Date.now() / 1000)
  if (d <= 0) return 'now'
  if (d < 3600) return `${Math.ceil(d / 60)}m`
  if (d < 86_400) return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`
  return `${Math.floor(d / 86_400)}d ${Math.floor((d % 86_400) / 3600)}h`
}

export const when = (sec: number | null | undefined) =>
  sec ? new Date(sec * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '—'

export const OUTCOME_STYLE: Record<string, { label: string; cls: string; emoji: string }> = {
  win: { label: 'WIN', cls: 'bg-green-100 text-green-700', emoji: '✅' },
  loss: { label: 'LOSS', cls: 'bg-red-100 text-red-700', emoji: '❌' },
  flat: { label: 'FLAT', cls: 'bg-gray-100 text-gray-700', emoji: '➖' },
  nofill: { label: 'NO FILL', cls: 'bg-gray-100 text-gray-500', emoji: '⏸️' },
  forfeited: { label: 'FORFEITED', cls: 'bg-red-600 text-white', emoji: '🚫' },
  sealed: { label: 'SEALED', cls: 'bg-purple-100 text-purple-700', emoji: '🔒' },
}

/** Day, month and time, without the timezone: for tight spaces. */
export const whenShort = (sec: number | null | undefined) =>
  sec ? new Date(sec * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
