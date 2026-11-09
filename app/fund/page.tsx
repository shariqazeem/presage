'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ActionButton, Eyebrow, Panel } from '@/components/kit'
import { IntentsFund } from '@/components/near/Funding'
import { NearButton, Verified, qty } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { FundSheet } from '@/components/near/sheets'
import { useDesk } from '@/lib/near/hooks'

/** Bring funds to NEAR from another chain with NEAR Intents, then add them to ParallaxPay. */
export default function Fund() {
  const { accountId } = useNear()
  const { data: desk, refetch } = useDesk(accountId)
  const [recipient, setRecipient] = useState('')
  const [arrived, setArrived] = useState<number | null>(null)
  const [fund, setFund] = useState(false)

  useEffect(() => {
    if (accountId && !recipient) setRecipient(accountId)
  }, [accountId, recipient])

  return (
    <div className="max-w-[720px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
      <Eyebrow>NEAR Intents</Eyebrow>
      <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.05] font-black tight mt-2">Bring funds to NEAR from any chain</h1>
      <p className="text-[16px] text-ink-2 mt-3 leading-snug">Send a coin from the chain it&rsquo;s on. NEAR Intents solvers swap it into USDC on NEAR and deliver it to your NEAR account. ParallaxPay never holds it on the way.</p>

      <Panel className="p-5 md:p-6 mt-6">
        {!accountId && (
          <div className="mb-5">
            <NearButton variant="full" label="Connect the NEAR wallet it should arrive in" />
            <p className="text-[13px] text-ink-3 mt-2 text-center">Or type any NEAR account below.</p>
          </div>
        )}
        <IntentsFund
          recipient={recipient}
          onRecipient={setRecipient}
          onArrived={got => {
            setArrived(got)
            void refetch()
          }}
        />
      </Panel>

      {arrived != null && (
        <Panel className="p-5 mt-4">
          <Verified ok>
            {qty(arrived)} USDC is in {recipient}.
          </Verified>
          {accountId === recipient && desk?.member ? (
            <ActionButton className="mt-4" onClick={() => setFund(true)}>
              Add it to ParallaxPay
            </ActionButton>
          ) : (
            <ActionButton className="mt-4" href="/start">
              Set up your agent
            </ActionButton>
          )}
        </Panel>
      )}

      <p className="text-[13px] text-ink-3 mt-6 leading-snug">
        Quotes and delivery come from NEAR Intents&rsquo; 1-Click service and its solvers. Check a swap any time on the{' '}
        <a href="https://explorer.near-intents.org" target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">
          NEAR Intents explorer
        </a>
        . Already have USDC on NEAR?{' '}
        <Link href="/desk" className="underline decoration-line underline-offset-2">
          Go to your agent
        </Link>
        .
      </p>
      <FundSheet open={fund} onClose={() => setFund(false)} onDone={() => void refetch()} />
    </div>
  )
}
