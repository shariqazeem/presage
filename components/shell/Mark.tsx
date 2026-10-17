import { useId } from 'react'

/**
 * The Called mark: a check in foil on a black tile, with the call sitting at the bottom of the V,
 * where the price turned. A check, and a dip that came back.
 */
export function Mark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Called">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.45" stopColor="#EC4899" />
          <stop offset="0.8" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0B0B0C" />
      <path d="M15 31 L27 43.5 L50 18" fill="none" stroke={`url(#m${id})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27" cy="43.5" r="4.4" fill="#FFFFFF" />
    </svg>
  )
}

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Called"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset="0.45" stop-color="#EC4899"/><stop offset="0.8" stop-color="#3B82F6"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0B0B0C"/><path d="M15 31 L27 43.5 L50 18" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27" cy="43.5" r="4.4" fill="#FFFFFF"/></svg>`
