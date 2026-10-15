import { ImageResponse } from 'next/og'
import { getAgent } from '@/lib/server/records'
import { HOUSE_PERSONAS } from '@/lib/personas'
import { OG_SIZE, OgFrame, ogFonts } from '@/lib/og'
import { pct, result as fmtResult } from '@/lib/client/format'

export const alt = 'A Presage agent and its public record'
export const size = OG_SIZE
export const contentType = 'image/png'

const DOT: Record<string, string> = { win: '#10B981', loss: '#EF4444', forfeited: '#991B1B', flat: '#9CA3AF', nofill: '#E5E7EB' }

/** The card an agent link shows: name, thesis, the record and its form guide. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = getAgent(slug)
  const fonts = await ogFonts()
  const tagline = a ? (HOUSE_PERSONAS[a.slug]?.tagline ?? a.description) : ''
  const r = a?.record
  const stats = r
    ? [
        ['Calls', String(r.calls)],
        ['Hit rate', pct(r.hitRate, 0)],
        [a!.kind === 'setup' ? 'Avg R' : 'Avg move', r.avgResult == null ? '—' : fmtResult(a!.kind, Math.round(r.avgResult))],
        ['Lost', String(r.losses + r.forfeited)],
      ]
    : []
  return new ImageResponse(
    (
      <OgFrame kicker={a ? `ERC-8004 #${a.id} on Metis` : undefined} footer="Every call sealed before the move. Losses included.">
        <div style={{ fontSize: 96, fontWeight: 900, color: '#000', lineHeight: 1, letterSpacing: -3 }}>{a?.name ?? 'Presage'}</div>
        <div style={{ fontSize: 32, fontWeight: 500, color: '#4B5563', marginTop: 16, fontStyle: 'italic' }}>{`“${tagline.slice(0, 90)}”`}</div>
        {r && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginTop: 36 }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#000' }}>{v}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: '#6B7280' }}>{k}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {Array.from({ length: Math.max(0, 10 - r.form.length) }).map((_, i) => (
                <div key={`p${i}`} style={{ width: 22, height: 22, borderRadius: 999, background: '#F3F4F6' }} />
              ))}
              {r.form.map((o, i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: 999, background: DOT[o] }} />
              ))}
            </div>
          </div>
        )}
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
