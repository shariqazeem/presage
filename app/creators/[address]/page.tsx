'use client'

import { use } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { formatUnits, type Address } from 'viem'
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { AgentCard } from '@/components/agents'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens, addressUrl } from '@/lib/chain'
import { useAgents } from '@/lib/client/hooks'
import { short } from '@/lib/client/format'

export default function CreatorPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: creator } = use(params)
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { data } = useAgents()
  const agents = (data?.agents ?? []).filter(a => a.creator.toLowerCase() === creator.toLowerCase())
  const isMe = address?.toLowerCase() === creator.toLowerCase()

  const { data: earned, refetch } = useReadContracts({
    contracts: payTokens.map(t => ({
      address: deployment?.market as Address,
      abi: presageMarketAbi,
      functionName: 'earnings' as const,
      args: [creator as Address, t.address] as const,
    })),
    query: { enabled: Boolean(deployment) },
  })

  const claim = async (token: Address, symbol: string) => {
    if (!deployment || !publicClient) return
    try {
      const hash = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'claim', args: [token] })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success(`Claimed your ${symbol}`)
      refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Failed'
      toast.error(msg.includes('User rejected') ? 'Cancelled' : msg)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="agents" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="text-sm text-gray-500 mb-1">Creator</div>
          <h1 className="text-4xl font-black text-black font-mono">{short(creator, 6)}</h1>
          <a href={addressUrl(creator)} target="_blank" rel="noreferrer" className="text-sm text-blue-700 underline">
            View on the Metis explorer
          </a>
        </motion.div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border-2 border-green-200 mb-8">
          <h2 className="text-xl font-black text-black mb-1">💰 Earnings in PresageMarket</h2>
          <p className="text-sm text-gray-600 mb-4">80% of every subscription to these agents, credited by the contract. Only the creator’s wallet can claim it.</p>
          <div className="grid md:grid-cols-3 gap-3">
            {payTokens.map((t, i) => {
              const v = (earned?.[i]?.result as bigint | undefined) ?? 0n
              return (
                <div key={t.symbol} className="bg-white rounded-xl p-4 border-2 border-green-200">
                  <div className="text-xs text-gray-500">{t.symbol}</div>
                  <div className="text-2xl font-black text-black mb-2">{Number(formatUnits(v, t.decimals)).toFixed(t.native ? 4 : 2)}</div>
                  {isMe && (
                    <button onClick={() => claim(t.address, t.symbol)} disabled={v === 0n} className="w-full bg-black text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 disabled:opacity-40">
                      Claim
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <h2 className="text-2xl font-black text-black mb-2">Every agent they launched</h2>
        <p className="text-gray-600 mb-4">Retired and losing agents stay here too, so nobody can launch twenty and show only the lucky one.</p>
        <div className="space-y-4">
          {agents.length === 0 && <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-600 border-2 border-gray-200">No agents yet.</div>}
          {agents.map((a, i) => (
            <AgentCard key={a.id} a={a} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
