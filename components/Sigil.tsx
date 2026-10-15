'use client'

/**
 * Every agent gets a mark in the Presage family: a black tile, a bar and a ring in the brand gradient.
 * The house agents have fixed marks. A creator's agent gets one built from its identity id, so it is
 * the same everywhere and nobody picks it.
 */
export function Sigil({ id, slug, size = 48, className = '' }: { id: number; slug?: string; size?: number; className?: string }) {
  const gid = `sg-${slug ?? id}-${size}`
  let glyph: React.ReactNode
  if (slug === 'oracle') {
    // The forecaster: an eye.
    glyph = (
      <>
        <circle cx="32" cy="32" r="15" fill="none" stroke={`url(#${gid})`} strokeWidth="6.5" />
        <circle cx="32" cy="32" r="5.5" fill="#FFFFFF" />
      </>
    )
  } else if (slug === 'st-quant') {
    // The sniper: a level and the crosshair that waits on it.
    glyph = (
      <>
        <rect x="12" y="43" width="40" height="6" rx="3" fill={`url(#${gid})`} />
        <circle cx="32" cy="26" r="11" fill="none" stroke={`url(#${gid})`} strokeWidth="6" />
        <rect x="29.5" y="10" width="5" height="32" rx="2.5" fill="#0A0A0A" />
        <rect x="29.5" y="18" width="5" height="16" rx="2.5" fill="#FFFFFF" />
      </>
    )
  } else {
    // Built from the identity: where the bar stands, how big the ring is, where the dot sits.
    let h = (id * 2654435761) >>> 0
    const next = (n: number) => {
      h = (h ^ (h >>> 13)) * 1274126177
      h >>>= 0
      return h % n
    }
    const barX = 12 + next(3) * 10
    const barH = 26 + next(3) * 7
    const ringR = 9 + next(3) * 2.5
    const ringX = 30 + next(3) * 5
    const ringY = 22 + next(3) * 7
    const dot = next(2) === 1
    const flip = next(2) === 1
    glyph = (
      <g transform={flip ? 'scale(-1,1) translate(-64,0)' : undefined}>
        <rect x={barX} y={54 - barH} width="6.5" height={barH} rx="3.25" fill={`url(#${gid})`} />
        <circle cx={ringX} cy={ringY} r={ringR} fill="none" stroke={`url(#${gid})`} strokeWidth="6" />
        {dot && <circle cx={ringX} cy={ringY} r="3.5" fill="#FFFFFF" />}
      </g>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="agent mark">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9333EA" />
          <stop offset="0.55" stopColor="#EC4899" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0A0A0A" />
      {glyph}
    </svg>
  )
}
