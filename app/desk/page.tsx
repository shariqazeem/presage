'use client'

import { useEffect, useState } from 'react'
import { ActionButton, Panel } from '@/components/kit'
import { Desk } from '@/components/near/Desk'
import { NearButton } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { previewDesk } from '@/lib/near/preview'

/** A member's desk: their vault account, ParallaxPay's proposals and trades for them, their rules. */
export default function DeskPage() {
  const { accountId, ready } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk, refetch, isLoading } = useDesk(accountId)
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    // Sample data for checking the design locally. Development builds only.
    if (process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('preview')) setPreview(true)
  }, [])
  if (preview) return <Desk data={previewDesk(agent?.reads ?? [])} agent={agent} refresh={() => {}} preview />
  if (accountId && desk?.member) return <Desk data={desk} agent={agent} refresh={() => void refetch()} />
  return (
    <div className="max-w-[560px] mx-auto px-4 pt-12 pb-20">
      <Panel className="p-6 md:p-8 text-center">
        <h1 className="font-heading text-[28px] font-black tight">Your desk</h1>
        {!ready || (accountId && isLoading) ? (
          <div className="h-24 mt-6 rounded-[14px] bg-paper-2 animate-pulse" />
        ) : !accountId ? (
          <>
            <p className="text-[15px] text-ink-2 mt-2">Connect the NEAR wallet you hired ParallaxPay with.</p>
            <div className="mt-6">
              <NearButton variant="full" />
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] text-ink-2 mt-2">{accountId} hasn’t hired ParallaxPay yet. It takes about two minutes.</p>
            <ActionButton href="/start" className="mt-6">
              Get started
            </ActionButton>
          </>
        )}
      </Panel>
    </div>
  )
}
