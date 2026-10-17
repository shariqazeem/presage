'use client'

import Link from 'next/link'
import { use } from 'react'
import { useAccount } from 'wagmi'
import { Sigil } from '@/components/Sigil'
import { WalletAvatar } from '@/components/WalletButton'
import { Earnings } from '@/components/Earnings'
import { ActionButton, Eyebrow, Panel, StatusLine, useMounted } from '@/components/kit'
import { FormDots } from '@/components/ui'
import { useFloor } from '@/lib/client/hooks'
import { addressUrl } from '@/lib/chain'
import { pct, short } from '@/lib/client/format'

/** A creator's page: every agent they built, the losing and the abandoned ones too. */
export default function CreatorPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: creator } = use(params)
  const mounted = useMounted()
  const { address } = useAccount()
  const { data } = useFloor(30_000)
  const agents = (data?.agents ?? []).filter(a => a.creator.toLowerCase() === creator.toLowerCase())
  const isMe = mounted && address?.toLowerCase() === creator.toLowerCase()
  return (
    <div className="max-w-[1000px] mx-auto px-5 md:px-8 pt-4 md:pt-10">
      <div className="flex items-center gap-4">
        <WalletAvatar address={creator} size={56} />
        <div className="min-w-0">
          <Eyebrow>Creator</Eyebrow>
          <div className="font-heading text-[26px] md:text-[40px] leading-none font-black tracking-tight mt-1 whitespace-nowrap">{short(creator)}</div>
          <a href={addressUrl(creator)} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-gray-500 hover:text-black">
            on the Metis explorer ↗
          </a>
        </div>
      </div>
      <p className="text-[14px] md:text-base text-gray-600 mt-4 max-w-2xl">Every agent this wallet built is listed here, including the ones that lost and the ones it stopped. Nothing is ever deleted, so nobody can launch twenty and show only the lucky one.</p>

      {isMe && (
        <Panel className="px-4 md:px-5 pt-3 pb-1 mt-5">
          <Earnings address={creator} />
        </Panel>
      )}

      <Panel className="px-4 md:px-6 pt-4 pb-2 mt-5">
        <Eyebrow>{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</Eyebrow>
        {agents.length === 0 ? (
          <div className="py-6 text-sm text-gray-500">No agents yet.</div>
        ) : (
          <div className="divide-y divide-gray-100 mt-1">
            {agents.map(a => (
              <Link key={a.id} href={`/agents/${a.slug}`} className="flex items-center gap-3 py-3.5 group">
                <Sigil id={a.id} size={44} className="rounded-xl shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-black truncate group-hover:underline">
                    {a.name} {a.retired && <span className="ml-1 text-[10px] font-black uppercase text-gray-400">retired</span>}
                  </div>
                  <div className="text-[12.5px] text-gray-500 truncate">
                    <StatusLine status={a.status} engineUp={data?.engineUp ?? true} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black tabular-nums">{a.record.hitRate != null ? pct(a.record.hitRate, 0) : `${a.record.calls} calls`}</div>
                  <FormDots form={a.record.form} size="sm" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
      {isMe && (
        <ActionButton href="/build" tone="white" className="mt-4">
          Build another
        </ActionButton>
      )}
    </div>
  )
}
