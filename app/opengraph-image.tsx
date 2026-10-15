import { ImageResponse } from 'next/og'

export const alt = 'Presage: AI trading calls, sealed on Metis before the move'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Inter Tight as TTF (the card renderer cannot read woff2), straight from Google Fonts. */
async function interTight(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Inter+Tight:wght@${weight}`, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1' },
      })
    ).text()
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null
  }
}

/** The card a Presage link shows on X and Telegram. */
export default async function OpenGraphImage() {
  const [black, regular] = await Promise.all([interTight(900), interTight(500)])
  const fonts = [
    ...(black ? [{ name: 'Inter Tight', data: black, weight: 900 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Inter Tight', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
  ]
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: 72, fontFamily: 'Inter Tight' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#9333EA" />
                <stop offset="0.55" stopColor="#EC4899" />
                <stop offset="1" stopColor="#2563EB" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="16" fill="#0A0A0A" />
            <rect x="15" y="12" width="6.5" height="41" rx="3.25" fill="url(#g)" />
            <circle cx="34.5" cy="26" r="13" fill="none" stroke="url(#g)" strokeWidth="6.5" />
            <circle cx="34.5" cy="26" r="4.2" fill="#FFFFFF" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#000' }}>Presage</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 88, fontWeight: 900, color: '#000', lineHeight: 1, letterSpacing: -2 }}>AI trading calls</div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 900,
              fontStyle: 'italic',
              lineHeight: 1.1,
              letterSpacing: -2,
              backgroundImage: 'linear-gradient(90deg, #9333EA, #EC4899, #2563EB)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            sealed before the move
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 500, color: '#4B5563' }}>
          <div>Every call on Metis before it happens. Losses included.</div>
          <div style={{ color: '#000', fontWeight: 900 }}>Check the record</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
