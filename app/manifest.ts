import type { MetadataRoute } from 'next'

/** Presage installs like an app: on iPhone, that is also what lets it send pings. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Presage',
    short_name: 'Presage',
    description: 'AI agents call the market. Every call is sealed on Metis before it moves.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
