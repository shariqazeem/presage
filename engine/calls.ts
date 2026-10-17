import { eq } from 'drizzle-orm'
import { parseEventLogs, stringToHex, type Hex } from 'viem'
import { calledLedgerAbi } from '../lib/abi/CalledLedger'
import { calledMarketAbi } from '../lib/abi/CalledMarket'
import { commitmentOf, newSalt, serializePayload, type CallPayload } from '../lib/calls/payload'
import type { Outcome } from '../lib/calls/rules'
import { deployment, publicClient } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { errMsg, log } from './log'
import { runnerBalance, write } from './tx'

const l = log('calls')

export const OUTCOME_CODE: Record<Outcome, number> = { win: 1, loss: 2, flat: 3, nofill: 4 }

export function contracts() {
  if (!deployment) throw new Error('Called is not deployed on this network yet')
  return deployment
}

type CallRow = typeof schema.calls.$inferSelect

/**
 * Seal a call on chain. The payload and salt are written to the database before the transaction is
 * sent: if they were lost, the call could never be revealed and would be forfeited.
 */
/**
 * Gas kept back for opening calls. A call sealed now must be opened later; if the runner can't pay for
 * that, the call is forfeited and counts as a loss. So below this, nothing new is sealed.
 */
export const REVEAL_RESERVE = 10n ** 17n // 0.1 METIS
let balanceAt = 0
let balanceCache = 0n

export class LowGasError extends Error {
  constructor(balance: bigint) {
    super(`runner has ${Number(balance) / 1e18} METIS, below the reserve kept for opening calls`)
  }
}

export async function publishCall(input: { payload: CallPayload; revealBy: number; requestId?: Hex }): Promise<CallRow> {
  if (Date.now() - balanceAt > 60_000) {
    balanceCache = await runnerBalance()
    balanceAt = Date.now()
  }
  if (balanceCache < REVEAL_RESERVE) throw new LowGasError(balanceCache)
  const db = getDb()
  const { payload } = input
  const json = serializePayload(payload)
  const salt = newSalt()
  const commitment = commitmentOf(salt, json)
  const setup = payload.rules === 'called/setup-v1' ? payload : null
  const dir = payload.rules === 'called/direction-v1' ? payload : null

  const [row] = await db
    .insert(schema.calls)
    .values({
      agentId: payload.agent,
      kind: setup ? 'setup' : 'direction',
      status: 'pending',
      payload: json,
      salt,
      commitment,
      revealBy: input.revealBy,
      issuedAt: payload.issuedAt,
      asset: payload.asset.symbol,
      side: setup ? setup.side : dir!.direction,
      priceAtIssue: payload.priceAtIssue,
      entry: setup ? setup.entry.price : null,
      stop: setup ? setup.stop : null,
      target: setup ? setup.target : null,
      horizonSec: dir ? dir.horizonSec : setup!.maxHoldSec,
      confidence: dir ? dir.confidence : (setup!.conviction ?? null),
      requestId: input.requestId ?? null,
    })
    .returning()

  const c = contracts()
  try {
    const sent = input.requestId
      ? await write({
          address: c.market,
          abi: calledMarketAbi,
          functionName: 'sealPaidCall',
          args: [input.requestId, commitment, input.revealBy],
          label: `seal paid call #${row.id} (${payload.asset.symbol})`,
        })
      : await write({
          address: c.calls,
          abi: calledLedgerAbi,
          functionName: 'seal',
          args: [BigInt(payload.agent), commitment, input.revealBy],
          label: `seal call #${row.id} (${payload.asset.symbol})`,
        })
    // CallSealed comes from CalledLedger even when the market sealed a paid call, so decode with its ABI.
    const ev = parseEventLogs({
      abi: calledLedgerAbi,
      eventName: 'CallSealed',
      logs: sent.receipt.logs.filter(x => x.address.toLowerCase() === c.calls.toLowerCase()),
    })[0]
    if (!ev) throw new Error('No CallSealed event in the seal transaction')
    const block = await publicClient.getBlock({ blockNumber: sent.receipt.blockNumber })
    const [updated] = await db
      .update(schema.calls)
      .set({
        chainCallId: Number(ev.args.callId),
        sealTx: sent.hash,
        sealedAt: Number(block.timestamp),
        status: 'sealed',
        error: null,
      })
      .where(eq(schema.calls.id, row.id))
      .returning()
    return updated
  } catch (e) {
    // The indexer reconciles by commitment, so a seal that landed despite this error is not lost.
    await db.update(schema.calls).set({ status: 'failed', error: errMsg(e) }).where(eq(schema.calls.id, row.id))
    throw e
  }
}

/** Reveal a sealed call with its outcome, then release or refund its escrow if it was paid for. */
export async function revealCall(row: CallRow, outcome: Outcome, result: number, resolution: object): Promise<void> {
  const db = getDb()
  const c = contracts()
  if (row.chainCallId == null) throw new Error(`Call #${row.id} has no chain id`)
  const sent = await write({
    address: c.calls,
    abi: calledLedgerAbi,
    functionName: 'reveal',
    args: [BigInt(row.chainCallId), row.salt as Hex, stringToHex(row.payload), OUTCOME_CODE[outcome], result],
    label: `reveal call #${row.id} → ${outcome} ${result}`,
  })
  const block = await publicClient.getBlock({ blockNumber: sent.receipt.blockNumber })
  await db
    .update(schema.calls)
    .set({
      status: 'revealed',
      outcome,
      result,
      resolution: JSON.stringify(resolution),
      revealTx: sent.hash,
      revealedAt: Number(block.timestamp),
    })
    .where(eq(schema.calls.id, row.id))

  if (row.requestId) await settlePaid(row.id, row.requestId as Hex)
}

export async function settlePaid(callRowId: number, requestId: Hex): Promise<void> {
  try {
    const sent = await write({
      address: contracts().market,
      abi: calledMarketAbi,
      functionName: 'settle',
      args: [requestId],
      label: `settle paid call #${callRowId}`,
    })
    await getDb().update(schema.calls).set({ settleTx: sent.hash }).where(eq(schema.calls.id, callRowId))
  } catch (e) {
    l.warn(`settle for call #${callRowId} will be retried`, { error: errMsg(e) })
  }
}
