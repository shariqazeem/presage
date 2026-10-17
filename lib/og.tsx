import type { ReactNode } from 'react'

/**
 * Shared pieces for the share cards (the images X and Telegram show for a Called link), in the
 * same paper-and-ink look as the app: ink type, mono numbers, and foil only on what is sealed.
 */

export const OG_SIZE = { width: 1200, height: 630 }

export const INK = '#0B0B0C'
export const INK_2 = '#3F3F46'
export const INK_3 = '#8A8A92'
export const UP = '#12A150'
export const DOWN = '#E5484D'
export const UP_D = '#3DDC84'
export const DOWN_D = '#FF6B6B'
export const FOIL = 'linear-gradient(90deg, #7C3AED, #EC4899, #3B82F6, #22D3EE)'
export const MONO = 'IBM Plex Mono'

/** A Google font as TTF (the card renderer cannot read woff2). */
async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}`, {
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
  const [black, medium, mono] = await Promise.all([googleFont('Inter Tight', 900), googleFont('Inter Tight', 500), googleFont(MONO, 600)])
  return [
    ...(black ? [{ name: 'Inter Tight', data: black, weight: 900 as const, style: 'normal' as const }] : []),
    ...(medium ? [{ name: 'Inter Tight', data: medium, weight: 500 as const, style: 'normal' as const }] : []),
    ...(mono ? [{ name: MONO, data: mono, weight: 600 as const, style: 'normal' as const }] : []),
  ]
}

/** The Called mark: a foil check on a black tile. */
export function OgMark({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.45" stopColor="#EC4899" />
          <stop offset="0.8" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={INK} />
      <path d="M15 31 L27 43.5 L50 18" fill="none" stroke="url(#g)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27" cy="43.5" r="4.4" fill="#FFFFFF" />
    </svg>
  )
}

/** The seal, as a sticker: foil, a black core, a white centre. */
export function OgSeal({ size = 56 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: 999, backgroundImage: 'linear-gradient(135deg, #7C3AED, #EC4899 45%, #3B82F6 80%, #22D3EE)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size * 0.5, height: size * 0.5, borderRadius: 999, background: INK }}>
        <div style={{ display: 'flex', width: size * 0.2, height: size * 0.2, borderRadius: 999, background: '#fff' }} />
      </div>
    </div>
  )
}

/** Small mono capitals, like the labels in the app. */
export function OgLabel({ children, color = INK_3, size = 20 }: { children: ReactNode; color?: string; size?: number }) {
  return <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 600, fontSize: size, letterSpacing: size * 0.12, textTransform: 'uppercase', color }}>{children}</div>
}

/** The card frame: mark and wordmark on top, a footer line, your content between. */
export function OgFrame({ children, footer, kicker, cta = 'Check the record' }: { children: ReactNode; footer: string; kicker?: string; cta?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: '56px 64px', fontFamily: 'Inter Tight' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <OgMark size={56} />
          <div style={{ fontSize: 40, fontWeight: 900, color: INK, letterSpacing: -1.4 }}>Called</div>
        </div>
        {kicker && <OgLabel>{kicker}</OgLabel>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 25, fontWeight: 500, color: INK_2, borderTop: '2px solid #E6E6E3', paddingTop: 22 }}>
        <div style={{ display: 'flex' }}>{footer}</div>
        <div style={{ display: 'flex', marginLeft: 'auto', color: INK, fontWeight: 900 }}>{cta} →</div>
      </div>
    </div>
  )
}
