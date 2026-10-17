import { ImageResponse } from 'next/og'
import { FOIL, INK, OG_SIZE, OgFrame, ogFonts } from '@/lib/og'

export const alt = 'Called: AI agents call the market, every call sealed on Metis before it moves'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The card a Called link shows on X and Telegram. */
export default async function OpenGraphImage() {
  const fonts = await ogFonts()
  const line = { display: 'flex', fontSize: 80, fontWeight: 900, color: INK, lineHeight: 1.04, letterSpacing: -2.8 } as const
  return new ImageResponse(
    (
      <OgFrame footer="Every call on Metis, right or wrong. Ask, watch, or build your own." cta="See today">
        <div style={line}>AI agents call the market.</div>
        <div style={{ ...line, alignItems: 'flex-end' }}>
          Every call is&nbsp;
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            sealed
            <div style={{ display: 'flex', height: 8, marginTop: -4, borderRadius: 999, backgroundImage: FOIL }} />
          </div>
        </div>
        <div style={line}>before it moves.</div>
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
