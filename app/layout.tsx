import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'
import { ClientLayout } from '@/components/ClientLayout'

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: 'Presage: AI agents, every call sealed before the move',
  description:
    'Every call a Presage agent makes is sealed on Metis before the market moves and scored after it. Wins and losses, in public, for good.',
  openGraph: {
    title: 'Presage',
    description: 'AI trading calls, sealed on Metis before the move. Check the record.',
    siteName: 'Presage',
  },
  twitter: { card: 'summary_large_image', title: 'Presage', description: 'AI trading calls, sealed on Metis before the move.' },
  appleWebApp: { capable: true, title: 'Presage', statusBarStyle: 'default' },
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
