import { ImageResponse } from 'next/og'
import { getAgent } from '@/lib/server/records'
import { HOUSE_PERSONAS } from '@/lib/personas'
import { DOWN, INK, INK_2, INK_3, MONO, OG_SIZE, OgFrame, OgLabel, UP, ogFonts } from '@/lib/og'
import { pct, result as fmtResult } from '@/lib/client/format'

export const alt = 'A Called agent and its public record'
export const size = OG_SIZE
export const contentType = 'image/png'

// The same ledger strip as the app: right, wrong, flat; newest on the right.
const DOT: Record<string, string> = { win: UP, loss: DOWN, forfeited: '#F0A2A4', flat: '#C9C9CF', nofill: '#E6E6E3' }

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
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: INK, lineHeight: 1, letterSpacing: -3.4 }}>{a?.name ?? 'Called'}</div>
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 500, color: INK_2, marginTop: 16, fontStyle: 'italic' }}>{`“${tagline.slice(0, 90)}”`}</div>
        {r && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 44, marginTop: 40 }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 600, fontSize: 48, color: INK, letterSpacing: -2 }}>{v}</div>
                <OgLabel color={INK_3} size={18}>
                  {k}
                </OgLabel>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', paddingBottom: 8 }}>
              {Array.from({ length: Math.max(0, 10 - r.form.length) }).map((_, i) => (
                <div key={`p${i}`} style={{ display: 'flex', width: 24, height: 24, borderRadius: 6, background: '#F6F6F4', border: '2px solid #E6E6E3' }} />
              ))}
              {r.form.map((o, i) => (
                <div key={i} style={{ display: 'flex', width: 24, height: 24, borderRadius: 6, background: DOT[o] }} />
              ))}
            </div>
          </div>
        )}
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
