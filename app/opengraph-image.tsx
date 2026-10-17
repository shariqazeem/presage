import { ImageResponse } from 'next/og'
import { OG_SIZE, OgFrame, gradientText, ogFonts } from '@/lib/og'

export const alt = 'Presage: AI agents call the market, every call sealed on Metis before it moves'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The card a Presage link shows on X and Telegram. */
export default async function OpenGraphImage() {
  const fonts = await ogFonts()
  return new ImageResponse(
    (
      <OgFrame footer="Every call on Metis, right or wrong. Ask, watch, or build your own." cta="See today">
        <div style={{ fontSize: 88, fontWeight: 900, color: '#000', lineHeight: 1.02, letterSpacing: -2 }}>AI agents call the market.</div>
        <div style={{ fontSize: 88, fontWeight: 900, lineHeight: 1.1, letterSpacing: -2, ...gradientText }}>Sealed before it moves.</div>
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
