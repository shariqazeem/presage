import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'
import { ClientLayout } from '@/components/ClientLayout'

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: 'ParallaxPay: an AI trader that works for you on NEAR, inside your rules',
  description:
    'ParallaxPay trades NEAR and Zcash for you from your own account in its vault on NEAR, inside the rules you set. Every plan is sealed on NEAR before the trade and opened after it.',
  openGraph: {
    title: 'ParallaxPay',
    description: 'An AI trader that works for you on NEAR, inside your rules. Every plan sealed before the trade.',
    siteName: 'ParallaxPay',
  },
  twitter: { card: 'summary_large_image', title: 'ParallaxPay', description: 'An AI trader that works for you on NEAR, inside your rules. Every plan sealed before the trade.' },
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
