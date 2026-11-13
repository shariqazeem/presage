import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter, Inter_Tight } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { agentSnapshot, candlesWithin } from '@/lib/near/snapshot'
import { CORE_SYMBOLS } from '@/lib/near/config'
import { ranked } from '@/lib/near/rank'
import { WARMUP, WINDOW } from '@/lib/near/drawing'
import type { AgentState } from '@/lib/near/hooks'
import type { Candle } from '@/lib/market/types'
import { ClientLayout } from '@/components/ClientLayout'

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-mono', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'ParallaxPay: an AI trader that works for you on NEAR, inside your rules', template: '%s · ParallaxPay' },
  description:
    'ParallaxPay trades the coins on Rhea for you, NEAR, ZEC, RHEA, AURORA and more, from your own account in its vault on NEAR, inside the rules you set. Every plan is sealed on NEAR before the trade and opened after it.',
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

/**
 * Pages arrive with the agent's live state and, for the coins the floor opens on (the six closest to a
 * trade), the candles for their drawings already in them. Other coins draw when someone opens them.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const agent = await agentSnapshot().catch(() => null)
  const first = agent?.reads.length ? ranked(agent.reads as AgentState['reads']).slice(0, 6).map(r => r.coin) : CORE_SYMBOLS
  const series = await Promise.all(first.map(c => candlesWithin(c, '1h', 700)))
  const draw: Record<string, Candle[]> = {}
  first.forEach((c, i) => {
    const s = series[i] as Candle[] | null
    if (s?.length) draw[c] = s.slice(-(WINDOW['1h'] + WARMUP))
  })
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers seed={{ now: Math.floor(Date.now() / 1000), agent: agent as AgentState | null, draw }}>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  )
}
