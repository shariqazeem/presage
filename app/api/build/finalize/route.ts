import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { parseEventLogs, type Hex } from 'viem'
import { presageAgentsAbi } from '@/lib/abi/PresageAgents'
import { deployment, publicClient } from '@/lib/chain'
import { getDb, schema } from '@/lib/db'
import { viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** After the creator's registration lands, check it on chain and list the agent. */
export async function POST(req: NextRequest) {
  const wallet = await viewer()
  if (!wallet) return NextResponse.json({ error: 'Sign in with your wallet first' }, { status: 401 })
  if (!deployment) return NextResponse.json({ error: 'Not deployed' }, { status: 503 })
  const { draftId, txHash } = (await req.json()) as { draftId: string; txHash: Hex }
  const db = getDb()
  const draft = db.select().from(schema.agentDrafts).where(eq(schema.agentDrafts.id, draftId)).get()
  if (!draft || draft.creator !== wallet) return NextResponse.json({ error: 'No such draft for this wallet' }, { status: 404 })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 })
  const ev = parseEventLogs({
    abi: presageAgentsAbi,
    eventName: 'AgentRegistered',
    logs: receipt.logs.filter(l => l.address.toLowerCase() === deployment!.agents.toLowerCase()),
  })[0]
  if (!ev) return NextResponse.json({ error: 'That transaction registered no agent' }, { status: 400 })
  if (ev.args.creator.toLowerCase() !== wallet || ev.args.specHash.toLowerCase() !== draft.specHash.toLowerCase()) {
    return NextResponse.json({ error: 'The registration does not match the draft' }, { status: 400 })
  }
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })
  const id = Number(ev.args.agentId)
  db.insert(schema.agents)
    .values({
      id,
      slug: draft.slug,
      name: draft.name,
      kind: 'setup',
      house: false,
      creator: wallet,
      description: draft.description,
      specJson: draft.specJson,
      specHash: draft.specHash,
      priceUsd6: draft.priceUsd6,
      callPriceUsd6: 0,
      registeredTx: txHash,
      registeredAt: Number(block.timestamp),
      createdAt: draft.createdAt,
    })
    .onConflictDoNothing()
    .run()
  db.update(schema.agentDrafts).set({ status: 'registered', identityId: id }).where(eq(schema.agentDrafts.id, draftId)).run()
  return NextResponse.json({ agentId: id, slug: draft.slug })
}
