import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import {
  HttpError,
  decodePaymentHeader,
  oracleAnswer,
  paymentResponseHeader,
  quoteOracleCall,
  verifyPayment,
} from '@/lib/server/x402'

export const dynamic = 'force-dynamic'

/**
 * x402 Oracle endpoint.
 *   1. POST {asset, horizon} with no X-PAYMENT  → 402 with payment requirements, a requestId and a secret.
 *   2. Pay: PresageMarket.payForCall(agentId, requestId, token, maxAmount) from your own wallet.
 *   3. POST again with X-PAYMENT (base64 {x402Version, scheme, network, payload:{requestId, txHash}})
 *      and {secret} in the body → 200 with the sealed answer once it is on chain, or 202 while it seals.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { asset?: string; horizon?: string; wallet?: string; secret?: string }
    const header = req.headers.get('x-payment')

    if (!header) {
      const quote = await quoteOracleCall({
        asset: body.asset ?? '',
        horizon: body.horizon ?? '',
        wallet: body.wallet,
        resource: new URL('/api/oracle/call', req.url).toString(),
      })
      return NextResponse.json(quote, { status: 402 })
    }

    const payment = decodePaymentHeader(header)
    if (!body.secret) throw new HttpError(400, 'Send the secret from the 402 response in the body')
    const paid = await verifyPayment(payment.payload.requestId, body.secret, payment.payload.txHash as Hex)

    // The engine answers within seconds; wait for the seal rather than make the client poll.
    const deadline = Date.now() + 50_000
    let answer = oracleAnswer(payment.payload.requestId, body.secret)
    while (!answer.call && answer.status !== 'failed' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1_000))
      answer = oracleAnswer(payment.payload.requestId, body.secret)
    }
    const headers = { 'X-PAYMENT-RESPONSE': paymentResponseHeader(paid) }
    if (answer.status === 'failed') return NextResponse.json(answer, { status: 502, headers })
    return NextResponse.json(answer, { status: answer.call ? 200 : 202, headers })
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status })
  }
}
