'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Desk } from '@/components/near/Desk'
import { NearButton } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { WatchDesk } from '@/components/near/Watching'
import { RestoreSheet } from '@/components/near/DeviceAccount'
import { Mark } from '@/components/shell/Mark'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { previewDesk } from '@/lib/near/preview'
import type { Rules } from '@/lib/near/vault'
import { savedRules, stopWatching, watching } from '@/lib/near/watch'

/** Your agent: one member's ParallaxPay, its proposals and trades for them, their mandate. */
export default function DeskPage() {
  const { accountId, ready } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk, refetch, isLoading } = useDesk(accountId)
  const [preview, setPreview] = useState(false)
  const [restore, setRestore] = useState(false)
  // A mandate written on this device and not funded yet: the agent already works on it.
  const [draft, setDraft] = useState<Rules | null>(null)
  useEffect(() => {
    // Sample data for checking the design locally. Development builds only.
    if (process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('preview')) setPreview(true)
    if (watching()) setDraft(savedRules())
  }, [])
  // Once it's signed on NEAR, the vault holds the mandate.
  useEffect(() => {
    if (desk?.member) stopWatching()
  }, [desk?.member])
  if (preview) return <Desk data={previewDesk(agent?.reads ?? [])} agent={agent} refresh={() => {}} preview />
  if (accountId && desk?.member) return <Desk data={desk} agent={agent} refresh={() => void refetch()} />
  // Stays mounted while a new account's desk loads, so a funding sheet in progress isn't lost.
  if (draft) return <WatchDesk rules={draft} agent={agent} member={desk?.member ?? null} onFunded={() => void refetch()} />
  return (
    <div className="max-w-[560px] mx-auto px-4 pt-10 md:pt-14 pb-24">
      <div className="rounded-[28px] bg-ink text-white p-6 md:p-8 text-center relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="relative w-fit mx-auto">
          <span className="absolute -inset-3 rounded-[26px] foil opacity-45 blur-[16px] animate-[soft-pulse_2.6s_ease-in-out_infinite]" />
          <span className="relative block">
            <Mark size={64} />
          </span>
        </div>
        <h1 className="font-heading text-[28px] md:text-[32px] font-black tight mt-6">Your agent lives here</h1>
        {!ready || (accountId && isLoading) ? (
          <div className="h-24 mt-6 rounded-[16px] bg-white/[0.06] animate-pulse" />
        ) : !accountId ? (
          <>
            <p className="text-[15px] text-[#C9C9CF] mt-2 leading-snug">Connect the NEAR wallet you hired ParallaxPay with to see what it is doing for you.</p>
            <div className="mt-6">
              <NearButton variant="full" />
            </div>
            <button onClick={() => setRestore(true)} className="mt-3 text-[13.5px] font-semibold text-[#C9C9CF] hover:text-white">
              Have a ParallaxPay account key? Open it here
            </button>
            <p className="mt-5 text-[13.5px] text-[#8A8A92]">
              Not hired yet?{' '}
              <Link href="/start" className="font-semibold text-white underline decoration-white/30 underline-offset-2">
                Hire ParallaxPay
              </Link>
              , no wallet needed.
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] text-[#C9C9CF] mt-2 leading-snug">{accountId} hasn&rsquo;t hired ParallaxPay yet. Writing its mandate takes about a minute.</p>
            <Link href="/start" className="mt-6 h-[52px] rounded-[16px] bg-white text-ink font-semibold grid place-items-center press">
              Hire ParallaxPay
            </Link>
          </>
        )}
      </div>
      <Link href="/" className="block text-center mt-4 text-[13.5px] font-semibold text-ink-3 hover:text-ink">
        Watch it work on the floor →
      </Link>
      <RestoreSheet open={restore} onClose={() => setRestore(false)} />
    </div>
  )
}
