import { NextResponse, type NextRequest } from 'next/server'
import { txOutcome } from '@/lib/near/rpc'
import { announce, syncMember } from '@/lib/near/store'
import { eventsFromVault } from '@/lib/near/vault'

export const dynamic = 'force-dynamic'

/**
 * Tells the agent about a member right after they join or change their rules. It trusts nothing in
 * the request but the account name: membership and rules are read from the vault on NEAR.
 */
export async function POST(req: NextRequest) {
  const { account, txHash } = (await req.json().catch(() => ({}))) as { account?: string; txHash?: string }
  if (!account || account.length > 64) return NextResponse.json({ error: 'Not a NEAR account' }, { status: 400 })
  const member = await syncMember(account).catch(() => null)
  // A deposit or withdrawal shows on the floor only as the vault itself logged it, in a transaction this account sent.
  if (txHash && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) {
    const out = await txOutcome(txHash, account).catch(() => null)
    if (out) announce(account, eventsFromVault(out.logsBy))
  }
  return NextResponse.json({ member })
}
