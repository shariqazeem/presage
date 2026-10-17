import { ImageResponse } from 'next/og'
import { getCall } from '@/lib/server/records'
import { DOWN_D, FOIL, INK, MONO, OG_SIZE, OgFrame, OgLabel, OgSeal, UP_D, ogFonts } from '@/lib/og'
import { result as fmtResult, price as fmtPrice } from '@/lib/client/format'

export const alt = 'A Called call, sealed on Metis before the move'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The card a receipt link shows: a black ticket with the call (if revealed) and how it came out. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = getCall(Number(id))
  const fonts = await ogFonts()
  const p = c?.payload
  const dir = c?.kind === 'direction'
  const outcome =
    c?.status === 'forfeited'
      ? 'FORFEITED'
      : c?.outcome === 'win'
        ? dir ? 'RIGHT' : 'WIN'
        : c?.outcome === 'loss'
          ? dir ? 'WRONG' : 'LOSS'
          : c?.outcome === 'nofill'
            ? 'NO FILL'
            : c?.outcome
              ? c.outcome.toUpperCase()
              : c?.status === 'sealed'
                ? 'SEALED'
                : ''
  const sealed = outcome === 'SEALED'
  const tone = outcome === 'WIN' || outcome === 'RIGHT' ? UP_D : outcome === 'LOSS' || outcome === 'WRONG' || outcome === 'FORFEITED' ? DOWN_D : '#C9C9CF'
  const exit = (c?.resolution as { exitPrice?: number } | null)?.exitPrice
  const headline = !c ? 'A Called call' : p ? (p.rules === 'called/setup-v1' ? `${p.asset.symbol} long` : `${p.asset.symbol} ${p.direction === 'up' ? '↑ up' : '↓ down'}`) : 'A sealed call'
  const detail = !c
    ? ''
    : p
      ? p.rules === 'called/setup-v1'
        ? `buy $${fmtPrice(p.entry.price)} · stop $${fmtPrice(p.stop)} · target $${fmtPrice(p.target)}`
        : exit != null && c.status === 'revealed'
          ? `$${fmtPrice(p.priceAtIssue)} → $${fmtPrice(exit)} · ${p.horizonSec / 3600}h`
          : `${p.confidence}% sure · ${p.horizonSec / 3600}h · from $${fmtPrice(p.priceAtIssue)}`
      : 'What it says opens later. Its fingerprint is on Metis now.'
  const no = c?.chainCallId != null ? `No. ${String(c.chainCallId).padStart(4, '0')}` : ''
  return new ImageResponse(
    (
      <OgFrame kicker={c ? c.agentName : undefined} footer="Sealed on Metis before the move. Scored by price after it.">
        <div style={{ display: 'flex', flexDirection: 'column', background: INK, borderRadius: 32, overflow: 'hidden' }}>
          <div style={{ display: 'flex', height: 6, backgroundImage: FOIL }} />
          <div style={{ display: 'flex', alignItems: 'center', padding: '34px 44px 36px', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <OgLabel color="#8A8A92">{`${no}${no ? ' · ' : ''}${sealed ? 'sealed on Metis' : 'opened on Metis'}`}</OgLabel>
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -3.4, marginTop: 14 }}>{headline}</div>
              <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 600, fontSize: 28, color: '#C9C9CF', marginTop: 18 }}>{detail}</div>
            </div>
            {sealed ? (
              <OgSeal size={120} />
            ) : outcome ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {c?.result != null && c.outcome !== 'nofill' && <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 600, fontSize: 72, color: tone, letterSpacing: -3 }}>{fmtResult(c.kind, c.result)}</div>}
                <OgLabel color={tone} size={26}>
                  {outcome}
                </OgLabel>
              </div>
            ) : null}
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
