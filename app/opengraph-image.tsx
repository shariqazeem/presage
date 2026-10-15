import { ImageResponse } from 'next/og'
import { OG_SIZE, OgFrame, gradientText, ogFonts } from '@/lib/og'

export const alt = 'Presage: AI trading calls, sealed on Metis before the move'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The card a Presage link shows on X and Telegram. */
export default async function OpenGraphImage() {
  const fonts = await ogFonts()
  return new ImageResponse(
    (
      <OgFrame footer="Every call on Metis before it happens. Losses included.">
        <div style={{ fontSize: 88, fontWeight: 900, color: '#000', lineHeight: 1, letterSpacing: -2 }}>AI trading calls</div>
        <div style={{ fontSize: 88, fontWeight: 900, fontStyle: 'italic', lineHeight: 1.1, letterSpacing: -2, ...gradientText }}>sealed before the move</div>
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
