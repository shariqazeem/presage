import { NextResponse, type NextRequest } from 'next/server'
import { SignatureError, verifyIntent, type SignedIntent } from '@/lib/near/signed'
import { HOUSE_ID, describe, traits, validBlocks, type StrategyIntent } from '@/lib/near/strategy'
import { getStrategy, saveStrategy, setMemberStrategy, strategyFor, type StrategyRow } from '@/lib/near/strategyStore'
import { vault } from '@/lib/near/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** A strategy with its settings: only ever sent to a member who owns or hired it. */
const unlocked = (s: StrategyRow) => ({ id: s.id, name: s.name, owner: s.owner, house: s.id === HOUSE_ID, public: s.public, adopted: s.adopted, blocks: s.blocks, traits: traits(s.blocks), settings: describe(s.blocks) })

/**
 * Your agent's strategy, every call signed with your account:
 * - `mine`: the strategy it runs, with its settings;
 * - `save`: your own building blocks, put on your agent (and on the board if you publish it);
 * - `hire`: a strategy from the board, whose settings unlock once it's yours.
 * Saving and hiring are for vault members: a strategy needs money to trade.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: StrategyIntent['action']; signed?: SignedIntent }
  const action = body.action
  if (action !== 'mine' && action !== 'save' && action !== 'hire') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  try {
    const intent = await verifyIntent(body.signed, action)
    const account = intent.account
    if (action === 'mine') return NextResponse.json({ strategy: unlocked(strategyFor(account)) })
    const member = await vault.member(account).catch(() => null)
    if (!member) return NextResponse.json({ error: 'Fund your agent first. Strategies are for agents with money to trade.' }, { status: 403 })
    if (action === 'save') {
      const blocks = validBlocks(intent.blocks)
      if (!blocks) return NextResponse.json({ error: 'Those settings aren’t ones the agent knows.' }, { status: 400 })
      const s = saveStrategy({ owner: account, name: String(intent.name ?? ''), blocks, words: typeof intent.words === 'string' ? intent.words : null, publish: intent.publish === true })
      return NextResponse.json({ strategy: unlocked(s) })
    }
    const s = getStrategy(String(intent.strategy ?? ''))
    if (!s || (!s.public && s.owner !== account)) return NextResponse.json({ error: 'That strategy isn’t on the board.' }, { status: 404 })
    setMemberStrategy(account, s.id)
    return NextResponse.json({ strategy: unlocked(s) })
  } catch (e) {
    if (e instanceof SignatureError) return NextResponse.json({ error: e.message }, { status: 401 })
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 160) : 'Something went wrong' }, { status: 500 })
  }
}

/** Anyone can see which strategy an agent runs, by name. Its settings stay with its members. */
export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account') ?? ''
  if (!/^[a-z0-9._-]{2,64}$/.test(account)) return NextResponse.json({ error: 'Bad account' }, { status: 400 })
  const s = strategyFor(account)
  return NextResponse.json({ strategy: { id: s.id, name: s.name, owner: s.owner, house: s.id === HOUSE_ID, adopted: s.adopted } })
}
