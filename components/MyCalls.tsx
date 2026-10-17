'use client'

import toast from 'react-hot-toast'
import type { Hex } from 'viem'
import { usePublicClient, useWriteContract } from 'wagmi'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment } from '@/lib/chain'
import { answerToView, type OracleAnswer, type Saved } from '@/lib/client/mine'
import { Sigil } from './Sigil'
import { CallLine } from './kit'

/** Your paid questions, each with how it came out, and a way to get your money back when one failed. */
export function MyCalls({ items, max = 12 }: { items: { saved: Saved; answer?: OracleAnswer }[]; max?: number }) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  // An answer that never came, or a call that was forfeited: the asker takes the money back from escrow.
  const refund = async (requestId: Hex) => {
    if (!publicClient || !deployment) return
    try {
      const r = await publicClient.readContract({ address: deployment.market, abi: presageMarketAbi, functionName: 'getRequest', args: [requestId] })
      if (r.state === 1) {
        const h = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'refundUndelivered', args: [requestId] })
        await publicClient.waitForTransactionReceipt({ hash: h })
      } else if (r.state === 2) {
        const h = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'settle', args: [requestId] })
        await publicClient.waitForTransactionReceipt({ hash: h })
      }
      const h2 = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'claim', args: [r.token] })
      await publicClient.waitForTransactionReceipt({ hash: h2 })
      toast.success('Refunded to your wallet')
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Refund failed'
      toast.error(msg.includes('DeliveryWindowOpen') ? 'The refund opens 15 minutes after paying' : /User rejected|User denied/i.test(msg) ? 'Cancelled' : msg)
    }
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.slice(0, max).map(i => {
        const v = i.answer ? answerToView(i.answer) : null
        const stuck = i.answer && !i.answer.call && (i.answer.status === 'failed' || ((i.answer.status === 'paid' || i.answer.status === 'answering') && Date.now() - i.saved.at > 16 * 60_000))
        const forfeited = i.answer?.call?.status === 'forfeited'
        if (v && !forfeited) return <CallLine key={i.saved.requestId} c={v} mine={{ myCall: i.answer?.myCall ?? i.saved.myCall ?? null }} />
        return (
          <div key={i.saved.requestId} className="flex items-center gap-3 py-3">
            <Sigil id={0} slug="oracle" size={40} className="rounded-xl shrink-0 opacity-60" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px] text-black">
                {i.saved.asset} · {i.saved.horizon}
              </div>
              <div className="text-[13px] text-gray-500">{forfeited ? 'Never opened in time: it counts as a loss, and your money comes back' : stuck ? 'It never got sealed. Your money is waiting in escrow.' : 'Being answered…'}</div>
            </div>
            {(stuck || forfeited) && (
              <button onClick={() => refund(i.saved.requestId)} className="h-9 px-3 rounded-xl bg-black text-white text-[13px] font-bold shrink-0">
                Get it back
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** You against the Oracle, on the calls where you made your own call first. */
export function versus(items: { answer?: OracleAnswer }[]) {
  let you = 0
  let oracle = 0
  let played = 0
  for (const i of items) {
    const a = i.answer
    const c = a?.call
    if (!a?.myCall || !c || c.status !== 'revealed' || !c.outcome || c.outcome === 'flat' || c.outcome === 'nofill') continue
    played++
    const agree = a.myCall === c.direction
    if (c.outcome === 'win') {
      oracle++
      if (agree) you++
    } else if (c.outcome === 'loss') {
      if (!agree) you++
    }
  }
  return { you, oracle, played }
}
