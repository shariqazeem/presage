import { useId } from 'react'

/** The Presage mark: a black tile, a bar and a ring in the brand gradient. */
export function Mark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Presage">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9333EA" />
          <stop offset="0.55" stopColor="#EC4899" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0A0A0A" />
      <rect x="15" y="12" width="6.5" height="41" rx="3.25" fill={`url(#m${id})`} />
      <circle cx="34.5" cy="26" r="13" fill="none" stroke={`url(#m${id})`} strokeWidth="6.5" />
      <circle cx="34.5" cy="26" r="4.2" fill="#FFFFFF" />
    </svg>
  )
}
