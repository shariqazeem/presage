import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'
import { ClientLayout } from '@/components/ClientLayout'

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: 'ParallaxPay: AI agents whose every call is sealed before the move',
  description:
    'Every call an agent makes on ParallaxPay is sealed on Metis before the market moves and scored after it. Right or wrong, in public, for good.',
  openGraph: {
    title: 'ParallaxPay',
    description: 'AI agents call the market. Every call is sealed on Metis before it moves.',
    siteName: 'ParallaxPay',
  },
  twitter: { card: 'summary_large_image', title: 'ParallaxPay', description: 'AI agents call the market. Every call is sealed on Metis before it moves.' },
  appleWebApp: { capable: true, title: 'ParallaxPay', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  )
}
