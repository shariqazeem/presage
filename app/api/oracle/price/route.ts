import { NextResponse } from 'next/server'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens, publicClient } from '@/lib/chain'
import { oracleAgentId } from '@/lib/server/x402'

export const dynamic = 'force-dynamic'

type Price = { symbol: string; amount: string | null; decimals: number; native: boolean }
let cache: { at: number; prices: Price[] } | null = null

/**
 * What one Oracle call costs right now in each token, read from the contract. A token the contract
 * cannot price (METIS while its price feed is stale) comes back with no amount, so the page can say so
 * before anyone tries to pay with it.
 */
export async function GET() {
  if (!deployment) return NextResponse.json({ prices: [] })
  const agentId = oracleAgentId()
  if (agentId == null) return NextResponse.json({ prices: [] })
  if (!cache || Date.now() - cache.at > 30_000) {
    const prices = await Promise.all(
      payTokens.map(async t => {
        try {
          const amount = await publicClient.readContract({ address: deployment!.market, abi: presageMarketAbi, functionName: 'callQuote', args: [BigInt(agentId), t.address] })
          return { symbol: t.symbol, amount: amount.toString(), decimals: t.decimals, native: t.native }
        } catch {
          return { symbol: t.symbol, amount: null, decimals: t.decimals, native: t.native }
        }
      }),
    )
    cache = { at: Date.now(), prices }
  }
  return NextResponse.json({ prices: cache.prices })
}
