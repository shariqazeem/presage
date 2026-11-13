'use client'

import Link from 'next/link'
import { Mark } from '@/components/shell/Mark'

/** A page that isn't there: said plainly, with the two ways back that matter. */
export default function NotFound() {
  return (
    <div className="max-w-[560px] mx-auto px-4 pt-16 md:pt-24 pb-28 md:pb-16 text-center">
      <Mark size={44} className="mx-auto" />
      <h1 className="font-heading text-[30px] md:text-[38px] font-black tight leading-tight mt-5">Nothing here.</h1>
      <p className="text-[15px] text-ink-2 mt-2 leading-snug">This page doesn&rsquo;t exist. ParallaxPay is still reading the market on the floor.</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
        <Link href="/" className="h-12 px-6 rounded-full bg-ink text-white text-[14.5px] font-semibold grid place-items-center press">
          Back to the floor
        </Link>
        <Link href="/board" className="h-12 px-6 rounded-full border border-line text-[14.5px] font-semibold grid place-items-center press hover:border-ink-3">
          See the board
        </Link>
      </div>
    </div>
  )
}
