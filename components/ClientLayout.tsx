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
 * that is already there underneath; after that Called opens straight onto what is happening.
 */
export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [intro, setIntro] = useState(false)
  useEffect(() => {
    try {
      if (!localStorage.getItem('called_intro_seen')) setIntro(true)
    } catch {}
  }, [])
  const done = () => {
    try {
      localStorage.setItem('called_intro_seen', '1')
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
          style: { background: '#0B0B0C', color: '#fff', fontWeight: 500, borderRadius: '14px', padding: '12px 16px', fontSize: '14px' },
          success: { iconTheme: { primary: '#3DDC84', secondary: '#0B0B0C' } },
          error: { iconTheme: { primary: '#FF6B6B', secondary: '#0B0B0C' } },
        }}
      />
      <AnimatePresence>{intro && <StartupScreen onComplete={done} />}</AnimatePresence>
    </>
  )
}
