import { useId } from 'react'

/**
 * The ParallaxPay mark: a white P with a foil P set behind it and a little offset. Two P's for
 * Parallax and Pay, and the offset is the parallax: the same letter seen from two points.
 */
export function Mark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="ParallaxPay">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.45" stopColor="#EC4899" />
          <stop offset="0.8" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0B0B0C" />
      <g transform="translate(-1.5 0)">
        <path d="M27 49 V19 H36.5 a9.5 9.5 0 0 1 0 19 H27" fill="none" stroke={`url(#m${id})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        {/* The front P keeps a black edge and a filled counter, so the foil only shows as the offset. */}
        <path d="M21 15 H30.5 a9.5 9.5 0 0 1 0 19 H21 Z" fill="#0B0B0C" />
        <path d="M21 45 V15 H30.5 a9.5 9.5 0 0 1 0 19 H21" fill="none" stroke="#0B0B0C" strokeWidth="12.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 45 V15 H30.5 a9.5 9.5 0 0 1 0 19 H21" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="ParallaxPay"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset=".45" stop-color="#EC4899"/><stop offset=".8" stop-color="#3B82F6"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0B0B0C"/><g transform="translate(-1.5 0)"><path d="M27 49 V19 H36.5 a9.5 9.5 0 0 1 0 19 H27" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 15 H30.5 a9.5 9.5 0 0 1 0 19 H21 Z" fill="#0B0B0C"/><path d="M21 45 V15 H30.5 a9.5 9.5 0 0 1 0 19 H21" fill="none" stroke="#0B0B0C" stroke-width="12.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 45 V15 H30.5 a9.5 9.5 0 0 1 0 19 H21" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`
