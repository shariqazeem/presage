import { ImageResponse } from 'next/og'
import { getCall } from '@/lib/server/records'
import { OG_SIZE, OgFrame, gradientText, ogFonts } from '@/lib/og'
import { result as fmtResult, price as fmtPrice } from '@/lib/client/format'

export const alt = 'A Presage call, sealed on Metis before the move'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The card a receipt link shows: the agent, the call (if revealed) and the outcome. */
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
  const tone = outcome === 'WIN' || outcome === 'RIGHT' ? '#059669' : outcome === 'LOSS' || outcome === 'WRONG' || outcome === 'FORFEITED' ? '#DC2626' : outcome === 'SEALED' ? '#7C3AED' : '#6B7280'
  const exit = (c?.resolution as { exitPrice?: number } | null)?.exitPrice
  const headline = !c ? 'A Presage call' : p ? (p.rules === 'presage/setup-v1' ? `${p.asset.symbol} long` : `${p.asset.symbol} ${p.direction}`) : 'A sealed call'
  const detail = !c
    ? ''
    : p
      ? p.rules === 'presage/setup-v1'
        ? `Buy $${fmtPrice(p.entry.price)} · stop $${fmtPrice(p.stop)} · target $${fmtPrice(p.target)}`
        : exit != null && c.status === 'revealed'
          ? `Said ${p.direction} at $${fmtPrice(p.priceAtIssue)} → closed at $${fmtPrice(exit)}`
          : `${p.confidence}% sure, over ${p.horizonSec / 3600} hours from $${fmtPrice(p.priceAtIssue)}`
      : 'What it says stays sealed until it opens. Its fingerprint is on Metis now.'
  return new ImageResponse(
    (
      <OgFrame kicker={c ? `${c.agentName} · call #${c.chainCallId}` : undefined} footer="Sealed on Metis before the move. Scored by price after it.">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
          <div style={{ fontSize: 108, fontWeight: 900, color: '#000', lineHeight: 1, letterSpacing: -3 }}>{headline}</div>
          {outcome && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {c?.result != null && <div style={{ fontSize: 64, fontWeight: 900, color: tone }}>{fmtResult(c.kind, c.result)}</div>}
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', background: tone, padding: '8px 18px', borderRadius: 999 }}>{outcome}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 34, fontWeight: 500, color: '#374151', marginTop: 22, ...(p ? {} : gradientText) }}>{detail}</div>
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
