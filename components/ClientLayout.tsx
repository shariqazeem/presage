'use client'

import { Toaster } from 'react-hot-toast'
import { MobileTop } from './shell/MobileTop'
import { TopNav } from './shell/TopNav'
import { TabBar } from './shell/TabBar'
import { Footer } from './shell/Footer'

/** The frame every page sits in. No splash: ParallaxPay opens straight onto what's happening. */
export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <MobileTop />
      <main className="min-h-[70vh]">{children}</main>
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Footer />
      </div>
      <TabBar />
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
