import { ImageResponse } from 'next/og'
import { FOIL, INK, OG_SIZE, OgFrame, ogFonts } from '@/lib/og'

export const alt = 'ParallaxPay: an AI trader that works for you on NEAR, inside your rules'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The card a ParallaxPay link shows on X and Telegram. */
export default async function OpenGraphImage() {
  const fonts = await ogFonts()
  const line = { display: 'flex', fontSize: 80, fontWeight: 900, color: INK, lineHeight: 1.04, letterSpacing: -2.8 } as const
  return new ImageResponse(
    (
      <OgFrame footer="Trades NEAR and Zcash from your own vault account. Every plan sealed on NEAR first." cta="Start">
        <div style={line}>An AI trader that</div>
        <div style={line}>works for you,</div>
        <div style={{ ...line, alignItems: 'flex-end' }}>
          inside&nbsp;
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            your rules.
            <div style={{ display: 'flex', height: 8, marginTop: -4, borderRadius: 999, backgroundImage: FOIL }} />
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts },
  )
}
