import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ImageResponse } from 'next/og'
import { DOWN, FOIL, INK, INK_2, INK_3, OG_SIZE, OgLabel, OgMark, UP, ogFonts } from '@/lib/og'
import { positionRow, toView } from '@/lib/near/store'

export const alt = 'A ParallaxPay promise: the plan it sealed on NEAR before the trade, and the chart it read'
export const size = OG_SIZE
export const contentType = 'image/png'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const usd = (n: number, sign = false) => `${sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`

/** The card a receipt link shows: the coin, how the promise ended, and the chart the plan was sealed on. */
export default async function ReceiptImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fonts = await ogFonts()
  const row = positionRow(Number(id))
  const t = row && row.status !== 'proposed' ? toView(row) : null
  const path = resolve(process.env.PARALLAXPAY_CHART_DIR ?? 'var/charts', `near-pos-${id}.png`)
  const chart = existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : null
  const closed = t?.status === 'closed' && t.pnlUsd != null
  const word = !t ? 'A sealed plan' : closed ? 'Kept' : t.status === 'open' ? 'Trading' : t.opened ? 'Opened' : 'Sealed on NEAR'
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#ffffff', fontFamily: 'Inter Tight' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 520, padding: '52px 0 48px 60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <OgMark size={52} />
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: INK, letterSpacing: -1.1 }}>ParallaxPay</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <OgLabel size={18}>{`Plan #${t?.callId ?? id} · ${word}`}</OgLabel>
            <div style={{ display: 'flex', fontSize: t ? 120 : 84, fontWeight: 900, color: INK, letterSpacing: -4, lineHeight: 1, marginTop: 12 }}>{t?.coin ?? 'A promise'}</div>
            {closed ? (
              <div style={{ display: 'flex', fontFamily: 'IBM Plex Mono', fontWeight: 600, fontSize: 56, color: t!.pnlUsd! >= 0 ? UP : DOWN, marginTop: 10 }}>{usd(t!.pnlUsd!, true)}</div>
            ) : (
              <div style={{ display: 'flex', width: 280, height: 7, marginTop: 14, borderRadius: 999, backgroundImage: FOIL }} />
            )}
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: INK_2, lineHeight: 1.3, marginTop: 18, width: 440 }}>
              {closed ? 'Sealed on NEAR before the trade, opened after it. Losses stay on the record too.' : 'Its entry, stop and target were fingerprinted on NEAR before the trade. The plan opens when it ends.'}
            </div>
          </div>
          <OgLabel color={INK_3} size={15}>
            Check it yourself on parallaxpay
          </OgLabel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, margin: '28px 28px 28px 0', borderRadius: 32, background: INK, padding: 22, position: 'relative' }}>
          <div style={{ display: 'flex', position: 'absolute', top: 0, left: 40, right: 40, height: 4, backgroundImage: FOIL, borderRadius: 999 }} />
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 900, color: '#ffffff' }}>The chart it read when it sealed this</div>
          <div style={{ display: 'flex', flex: 1, marginTop: 16, borderRadius: 18, overflow: 'hidden', background: '#0d1117' }}>
            {chart ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={chart} width={596} height={432} style={{ objectFit: 'cover' }} />
            ) : (
              <div style={{ display: 'flex', margin: 'auto', fontSize: 22, color: '#8A8A92' }}>Sealed on NEAR</div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
