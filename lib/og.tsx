import type { ReactNode } from 'react'

/** Shared pieces for the share cards (the images X and Telegram show for a Presage link). */

export const OG_SIZE = { width: 1200, height: 630 }

/** Inter Tight as TTF (the card renderer cannot read woff2), straight from Google Fonts. */
export async function interTight(weight: number): Promise<ArrayBuffer | null> {
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

export async function ogFonts() {
  const [black, medium] = await Promise.all([interTight(900), interTight(500)])
  return [
    ...(black ? [{ name: 'Inter Tight', data: black, weight: 900 as const, style: 'normal' as const }] : []),
    ...(medium ? [{ name: 'Inter Tight', data: medium, weight: 500 as const, style: 'normal' as const }] : []),
  ]
}

export function OgMark({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
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
  )
}

/** The card frame: mark and wordmark on top, a footer line, your content between. */
export function OgFrame({ children, footer, kicker, cta = 'Check the record' }: { children: ReactNode; footer: string; kicker?: string; cta?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: 64, fontFamily: 'Inter Tight' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <OgMark size={60} />
          <div style={{ fontSize: 38, fontWeight: 900, color: '#000' }}>Presage</div>
        </div>
        {kicker && <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: '#6B7280' }}>{kicker}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 500, color: '#4B5563' }}>
        <div style={{ display: 'flex' }}>{footer}</div>
        <div style={{ display: 'flex', marginLeft: 'auto', color: '#000', fontWeight: 900 }}>{cta}</div>
      </div>
    </div>
  )
}

export const gradientText = {
  backgroundImage: 'linear-gradient(90deg, #9333EA, #EC4899, #2563EB)',
  backgroundClip: 'text',
  color: 'transparent',
} as const
