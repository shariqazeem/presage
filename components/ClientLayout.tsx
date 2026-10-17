'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { StartupScreen } from './StartupScreen'
import { TopNav } from './shell/TopNav'
import { TabBar } from './shell/TabBar'
import { Footer } from './shell/Footer'

/**
 * The frame every page sits in. The intro plays once, on someone's very first visit, over a page
 * that is already there underneath; after that Presage opens straight onto what is happening.
 */
export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [intro, setIntro] = useState(false)
  useEffect(() => {
    try {
      if (!localStorage.getItem('presage_intro_seen')) setIntro(true)
    } catch {}
  }, [])
  const done = () => {
    try {
      localStorage.setItem('presage_intro_seen', '1')
    } catch {}
    setIntro(false)
  }
  return (
    <>
      <TopNav />
      <main className="min-h-[70vh]">{children}</main>
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Footer />
      </div>
      <TabBar />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { background: '#0A0A0A', color: '#fff', fontWeight: 600, borderRadius: '16px', padding: '12px 16px', fontSize: '14px' },
          success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
        }}
      />
      <AnimatePresence>{intro && <StartupScreen onComplete={done} />}</AnimatePresence>
    </>
  )
}
