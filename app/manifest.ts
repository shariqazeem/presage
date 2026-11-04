import type { MetadataRoute } from 'next'

/** ParallaxPay installs like an app on a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ParallaxPay',
    short_name: 'ParallaxPay',
    description: 'An AI trader that works for you on NEAR, inside your rules.',
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
