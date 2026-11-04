import { NextResponse, type NextRequest } from 'next/server'
import { USDC_ID, coinById } from '@/lib/near/config'
import { txOutcome } from '@/lib/near/rpc'
import { closePosition, feed, markOpen, positionRow, syncMember, toView } from '@/lib/near/store'
import { eventsFromVault, tradeEnd } from '@/lib/near/vault'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = positionRow(Number((await params).id))
  if (!row) return NextResponse.json({ error: 'No such trade' }, { status: 404 })
  return NextResponse.json({ position: toView(row) })
}

/**
 * A member approved a proposal (or a sale) from their own wallet. The transaction is read back from
 * NEAR and must be this member's vault trade on this sealed call; nothing else in the request counts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = positionRow(Number((await params).id))
  if (!row) return NextResponse.json({ error: 'No such trade' }, { status: 404 })
  const { txHash, action } = (await req.json().catch(() => ({}))) as { txHash?: string; action?: 'approve' | 'sell' }
  const coin = coinById(row.coin)
  if (!coin) return NextResponse.json({ error: 'Unknown coin' }, { status: 400 })

  if (!txHash || !/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) return NextResponse.json({ error: 'Missing transaction' }, { status: 400 })
  const out = await txOutcome(txHash, row.accountId).catch(() => null)
  if (!out) return NextResponse.json({ error: 'That transaction was not sent by this account' }, { status: 400 })
  const end = tradeEnd(eventsFromVault(out.logsBy))
  if (!end || end.account_id !== row.accountId || end.call !== row.callId) return NextResponse.json({ error: 'That transaction is not this trade' }, { status: 400 })
  if (end.outcome !== 'filled') return NextResponse.json({ error: 'The trade did not fill: the price moved past the minimum. Nothing was spent.' }, { status: 409 })

  if (action === 'approve' && row.status === 'proposed' && end.token_in === USDC_ID && end.token_out === coin.id) {
    const price = markOpen(row, coin, BigInt(end.amount_in), BigInt(end.amount_out), txHash)
    feed('enter', `You approved: bought ${coin.symbol} at ${price.toPrecision(5)}. ParallaxPay watches the stop and target and will ask before selling.`, { accountId: row.accountId, coin: coin.id, tx: txHash, actor: 'parallaxpay' })
    feed('member', `${row.accountId} approved ParallaxPay's ${coin.symbol} plan #${row.callId} and bought.`, { coin: coin.id, tx: txHash, actor: row.accountId })
  } else if (action === 'sell' && row.status === 'open' && end.token_in === coin.id && end.token_out === USDC_ID) {
    closePosition(row, coin, BigInt(end.amount_in), BigInt(end.amount_out), txHash, row.exitReason ?? 'sold by you')
    feed('member', `${row.accountId} approved the sale on ParallaxPay's ${coin.symbol} plan #${row.callId}.`, { coin: coin.id, tx: txHash, actor: row.accountId })
  } else {
    return NextResponse.json({ error: 'That transaction does not match this step' }, { status: 409 })
  }
  await syncMember(row.accountId).catch(() => null)
  return NextResponse.json({ position: toView(positionRow(row.id)!, row.accountId) })
}
