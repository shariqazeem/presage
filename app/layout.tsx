import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter, Inter_Tight } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { agentSnapshot, candlesWithin } from '@/lib/near/snapshot'
import { ClientLayout } from '@/components/ClientLayout'

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-mono', display: 'swap' })

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

export const dynamic = 'force-dynamic'

/** Pages arrive with the agent's live state and the first chart's candles already in them. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const agent = await agentSnapshot().catch(() => null)
  const coin = agent?.reads.find(r => r.setup)?.coin ?? 'NEAR'
  const candles = await candlesWithin(coin, '1h', 700)
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers seed={{ agent, candles: candles ? { coin, tf: '1h', candles } : null }}>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  )
}
