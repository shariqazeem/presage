'use client'

import Link from 'next/link'
import { NearButton } from '../near/kit'
import { Mark } from './Mark'

/** The phone's top bar: the mark, the agent's live dot, the wallet. Navigation lives in the tab bar. */
export function MobileTop() {
  return (
    <header className="md:hidden sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="h-[52px] px-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 press">
          <Mark size={28} />
          <span className="font-heading text-[18px] font-black tight">ParallaxPay</span>
          <span className="w-1.5 h-1.5 rounded-full bg-up animate-[soft-pulse_2s_ease-in-out_infinite]" aria-label="live" />
        </Link>
        <NearButton variant="nav" label="Connect" />
      </div>
    </header>
  )
}
