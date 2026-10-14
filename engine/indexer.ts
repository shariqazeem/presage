import { and, eq, inArray } from 'drizzle-orm'
import { parseEventLogs, type Address, type Log } from 'viem'
import { presageAgentsAbi } from '../lib/abi/PresageAgents'
import { presageCallsAbi } from '../lib/abi/PresageCalls'
import { presageMarketAbi } from '../lib/abi/PresageMarket'
import { publicClient } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { contracts } from './calls'
import { errMsg, log } from './log'

const l = log('indexer')
const KEY = 'indexer:lastBlock'
const STEP = 2_000n

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x))

const blockTimes = new Map<bigint, number>()
async function timeOf(block: bigint): Promise<number> {
  const hit = blockTimes.get(block)
  if (hit) return hit
  const b = await publicClient.getBlock({ blockNumber: block })
  blockTimes.set(block, Number(b.timestamp))
  if (blockTimes.size > 5_000) blockTimes.clear()
  return Number(b.timestamp)
}

/** Pull new Presage events from the chain into the database. The chain is the source of truth. */
export async function indexOnce(): Promise<void> {
  const db = getDb()
  const c = contracts()
  const names: Record<string, string> = {
    [c.agents.toLowerCase()]: 'PresageAgents',
    [c.calls.toLowerCase()]: 'PresageCalls',
    [c.market.toLowerCase()]: 'PresageMarket',
  }
  const stored = db.select().from(schema.kv).where(eq(schema.kv.key, KEY)).get()
  let from = stored ? BigInt(stored.value) + 1n : BigInt(c.deployedAtBlock)
  const latest = await publicClient.getBlockNumber()

  while (from <= latest) {
    const to = from + STEP - 1n > latest ? latest : from + STEP - 1n
    const raw = await publicClient.getLogs({ address: [c.agents, c.calls, c.market] as Address[], fromBlock: from, toBlock: to })
    const parsed = [
      ...parseEventLogs({ abi: presageAgentsAbi, logs: raw.filter(x => x.address.toLowerCase() === c.agents.toLowerCase()) }),
      ...parseEventLogs({ abi: presageCallsAbi, logs: raw.filter(x => x.address.toLowerCase() === c.calls.toLowerCase()) }),
      ...parseEventLogs({ abi: presageMarketAbi, logs: raw.filter(x => x.address.toLowerCase() === c.market.toLowerCase()) }),
    ].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex)

    for (const ev of parsed) {
      const timestamp = await timeOf(ev.blockNumber)
      const id = `${ev.transactionHash}:${ev.logIndex}`
      db.insert(schema.chainEvents)
        .values({
          id,
          block: Number(ev.blockNumber),
          txHash: ev.transactionHash,
          logIndex: ev.logIndex,
          contract: names[ev.address.toLowerCase()],
          name: ev.eventName,
          args: json(ev.args),
          timestamp,
        })
        .onConflictDoNothing()
        .run()
      try {
        await apply(ev as unknown as Log & { eventName: string; args: Record<string, unknown> }, timestamp)
      } catch (e) {
        l.warn(`could not apply ${ev.eventName} ${id}: ${errMsg(e)}`)
      }
    }

    db.insert(schema.kv)
      .values({ key: KEY, value: to.toString() })
      .onConflictDoUpdate({ target: schema.kv.key, set: { value: to.toString() } })
      .run()
    from = to + 1n
  }
}

async function apply(ev: Log & { eventName: string; args: Record<string, unknown> }, timestamp: number) {
  const db = getDb()
  const a = ev.args
  switch (ev.eventName) {
    case 'CallSealed': {
      // Repairs a row whose seal landed while the process that sent it failed or crashed.
      db.update(schema.calls)
        .set({ chainCallId: Number(a.callId), sealTx: ev.transactionHash, sealedAt: timestamp, status: 'sealed', error: null })
        .where(and(eq(schema.calls.commitment, String(a.commitment)), inArray(schema.calls.status, ['pending', 'failed'])))
        .run()
      break
    }
    case 'CallRevealed':
      db.update(schema.calls)
        .set({ status: 'revealed' })
        .where(and(eq(schema.calls.chainCallId, Number(a.callId)), eq(schema.calls.status, 'sealed')))
        .run()
      break
    case 'CallForfeited':
      db.update(schema.calls).set({ status: 'forfeited' }).where(eq(schema.calls.chainCallId, Number(a.callId))).run()
      break
    case 'Subscribed':
      db.insert(schema.subscriptions)
        .values({
          agentId: Number(a.agentId),
          subscriber: String(a.subscriber).toLowerCase(),
          until: Number(a.until),
          lastTx: ev.transactionHash!,
        })
        .onConflictDoUpdate({
          target: [schema.subscriptions.agentId, schema.subscriptions.subscriber],
          set: { until: Number(a.until), lastTx: ev.transactionHash! },
        })
        .run()
      break
    case 'CallPaid':
      db.update(schema.oracleRequests)
        .set({
          status: 'paid',
          payTx: ev.transactionHash,
          payer: String(a.payer).toLowerCase(),
          token: String(a.token),
          amount: String(a.amount),
          paidAt: timestamp,
        })
        .where(and(eq(schema.oracleRequests.requestId, String(a.requestId)), eq(schema.oracleRequests.status, 'quoted')))
        .run()
      break
    case 'AgentRegistered':
      db.update(schema.agents)
        .set({ registeredTx: ev.transactionHash, registeredAt: timestamp })
        .where(eq(schema.agents.id, Number(a.agentId)))
        .run()
      break
    case 'AgentRetired':
      db.update(schema.agents).set({ retired: true }).where(eq(schema.agents.id, Number(a.agentId))).run()
      break
    case 'PriceSet':
      db.update(schema.agents)
        .set({ priceUsd6: Number(a.priceUsd6), callPriceUsd6: Number(a.callPriceUsd6) })
        .where(eq(schema.agents.id, Number(a.agentId)))
        .run()
      break
  }
}
