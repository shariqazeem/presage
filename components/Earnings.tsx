'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { formatUnits } from 'viem'
import { usePublicClient, useReadContracts, useWriteContract } from 'wagmi'
import { calledMarketAbi } from '@/lib/abi/CalledMarket'
import { deployment, payTokens } from '@/lib/chain'
import { Eyebrow } from './kit'

/** What a creator can withdraw: 80% of what backers paid, held by the contract, per token. */
export function Earnings({ address }: { address: string }) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<string | null>(null)
  const { data, refetch } = useReadContracts({
    contracts: deployment ? payTokens.map(t => ({ address: deployment!.market, abi: calledMarketAbi, functionName: 'earnings', args: [address as `0x${string}`, t.address] }) as const) : [],
    query: { enabled: Boolean(deployment) },
  })
  const owed = payTokens.map((t, i) => ({ t, amount: (data?.[i]?.result as bigint | undefined) ?? 0n })).filter(x => x.amount > 0n)
  if (!owed.length) return null
  const claim = async (token: (typeof payTokens)[number]) => {
    if (!deployment || !publicClient) return
    setBusy(token.symbol)
    try {
      const h = await writeContractAsync({ address: deployment.market, abi: calledMarketAbi, functionName: 'claim', args: [token.address] })
      await publicClient.waitForTransactionReceipt({ hash: h })
      toast.success(`Claimed your ${token.symbol.replace(/^m\./, '')}`)
      await refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Claim failed'
      toast.error(/User rejected|User denied/i.test(msg) ? 'Cancelled' : msg)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="mt-2 mb-2 rounded-[16px] bg-ink text-white p-4">
      <Eyebrow className="text-[#9C9CA3] flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full foil" />
        Yours to claim
      </Eyebrow>
      <div className="mt-2 space-y-2">
        {owed.map(({ t, amount }) => (
          <div key={t.symbol} className="flex items-center justify-between gap-3">
            <div className="num text-xl font-semibold tracking-[-0.03em] text-white">
              {Number(formatUnits(amount, t.decimals)).toLocaleString('en-US', { maximumFractionDigits: t.native ? 4 : 2 })} {t.symbol.replace(/^m\./, '')}
            </div>
            <button onClick={() => claim(t)} disabled={busy === t.symbol} className="h-9 px-4 rounded-[10px] bg-white text-ink text-sm font-semibold hover:bg-[#EDEDEA] disabled:opacity-60">
              {busy === t.symbol ? 'Claiming…' : 'Claim'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
