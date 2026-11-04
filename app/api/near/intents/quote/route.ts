import { NextResponse, type NextRequest } from 'next/server'
import { DESTINATION_ASSET, ONE_CLICK, ORIGINS, oneClickHeaders } from '@/lib/near/intents'

export const dynamic = 'force-dynamic'

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/

/**
 * A 1-Click quote that delivers USDC to a NEAR account. `dry` previews the price; a real quote also
 * returns the one-time deposit address. Refunds go back to `refundTo` on the coin's own chain.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { originAsset?: string; amount?: string; refundTo?: string; recipient?: string; dry?: boolean }
  const origin = ORIGINS.find(o => o.assetId === b.originAsset)
  if (!origin) return NextResponse.json({ error: 'Pick a coin to send' }, { status: 400 })
  if (!b.amount || !/^\d{1,40}$/.test(b.amount) || BigInt(b.amount) === 0n) return NextResponse.json({ error: 'Enter an amount' }, { status: 400 })
  if (!b.recipient || !NEAR_ACCOUNT.test(b.recipient) || b.recipient.length > 64) return NextResponse.json({ error: 'Enter the NEAR account to receive the USDC' }, { status: 400 })
  const dry = b.dry !== false
  if (!dry && (!b.refundTo || b.refundTo.length < 20 || b.refundTo.length > 128)) return NextResponse.json({ error: `Enter your ${origin.chain} address for refunds` }, { status: 400 })
  const res = await fetch(`${ONE_CLICK}/v0/quote`, {
    method: 'POST',
    headers: oneClickHeaders(),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      dry,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: origin.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: DESTINATION_ASSET,
      amount: b.amount,
      // A dry quote doesn't need a real refund address; 1-Click only checks the format.
      refundTo: b.refundTo || (origin.chain === 'Solana' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : origin.chain === 'Bitcoin' ? 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' : origin.chain === 'Tron' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : '0x1111111111111111111111111111111111111111'),
      refundType: 'ORIGIN_CHAIN',
      recipient: b.recipient,
      recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
      referral: 'parallaxpay',
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json({ error: (body as { message?: string }).message ?? 'NEAR Intents could not quote that' }, { status: 400 })
  return NextResponse.json(body)
}
