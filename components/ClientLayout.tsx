'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import { MobileTop } from './shell/MobileTop'
import { TopNav } from './shell/TopNav'
import { TabBar } from './shell/TabBar'
import { Footer } from './shell/Footer'

/** The frame every page sits in. No splash: ParallaxPay opens straight onto what's happening. */
export function ClientLayout({ children }: { children: React.ReactNode }) {
  // Hiring the agent is a full-screen flow, like an app's onboarding: no tabs, no footer.
  const immersive = (usePathname() ?? '').startsWith('/start')
  return (
    <>
      {!immersive && <TopNav />}
      {!immersive && <MobileTop />}
      <main className="min-h-[70vh]">{children}</main>
      {!immersive && (
        <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <Footer />
        </div>
      )}
      {!immersive && <TabBar />}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { background: '#0B0B0C', color: '#fff', fontWeight: 500, borderRadius: '14px', padding: '12px 16px', fontSize: '14px' },
          success: { iconTheme: { primary: '#3DDC84', secondary: '#0B0B0C' } },
          error: { iconTheme: { primary: '#FF6B6B', secondary: '#0B0B0C' } },
        }}
      />
    </>
  )
}
