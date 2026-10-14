import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Hex } from 'viem'
import { presageCallsAbi } from '../lib/abi/PresageCalls'
import { presageMarketAbi } from '../lib/abi/PresageMarket'
import { parsePayload } from '../lib/calls/payload'
import { earliestResolution, resolveDirection, resolveSetup } from '../lib/calls/rules'
import { binanceCloseAt } from '../lib/market/binance'
import { candles15mSince } from '../lib/market/frames'
import { getDb, schema } from '../lib/db'
import { contracts, revealCall, settlePaid } from './calls'
import { errMsg, log } from './log'
import { write } from './tx'

const l = log('resolver')

/** Work out every open call that can be resolved, and reveal it. Most urgent deadline first. */
export async function resolveDue(): Promise<void> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const open = await db
    .select()
    .from(schema.calls)
    .where(eq(schema.calls.status, 'sealed'))
    .orderBy(asc(schema.calls.revealBy))

  for (const row of open) {
    try {
      const p = parsePayload(row.payload)
      if (now < earliestResolution(p) || row.sealedAt == null) continue

      if (now > row.revealBy) {
        // Should never happen: it means the engine was down past a deadline. Say so and forfeit it,
        // so the record shows it plainly.
        l.error(`call #${row.id} missed its reveal deadline; forfeiting`)
        await write({
          address: contracts().calls,
          abi: presageCallsAbi,
          functionName: 'forfeit',
          args: [BigInt(row.chainCallId!)],
          label: `forfeit call #${row.id}`,
        })
        await db.update(schema.calls).set({ status: 'forfeited' }).where(eq(schema.calls.id, row.id))
        continue
      }

      if (p.rules === 'presage/setup-v1') {
        const candles = await candles15mSince(p.asset, row.sealedAt)
        const res = resolveSetup(p, candles, row.sealedAt, now)
        if (res) {
          await revealCall(row, res.outcome, res.result, {
            ...res.detail,
            candles: { source: p.asset.source, timeframe: '15m', from: row.sealedAt, to: now },
          })
        }
      } else {
        if (p.asset.source !== 'binance') throw new Error('Direction calls resolve on Binance prices only')
        const at = p.issuedAt + p.horizonSec
        const close = await binanceCloseAt(p.asset.market, at)
        if (close) {
          const res = resolveDirection(p, close.price)
          await revealCall(row, res.outcome, res.result, {
            ...res.detail,
            candles: { source: 'binance', market: p.asset.market, timeframe: '1m', minute: close.minute },
          })
        }
      }
    } catch (e) {
      l.warn(`call #${row.id} not resolved yet: ${errMsg(e)}`)
    }
  }

  // Paid calls whose reveal landed but whose settlement did not: retry.
  const unsettled = await db
    .select({ id: schema.calls.id, requestId: schema.calls.requestId })
    .from(schema.calls)
    .where(and(eq(schema.calls.status, 'revealed'), isNotNull(schema.calls.requestId), isNull(schema.calls.settleTx)))
  for (const u of unsettled) await settlePaid(u.id, u.requestId as Hex)
}

/**
 * Paid Oracle requests that were never answered: once the delivery window has passed, refund the
 * payer through the escrow. The payer can do this too; the engine just does it for them.
 */
export async function refundUndelivered(): Promise<void> {
  const db = getDb()
  const cutoff = Math.floor(Date.now() / 1000) - 16 * 60
  const stuck = await db.select().from(schema.oracleRequests).where(eq(schema.oracleRequests.status, 'failed'))
  for (const r of stuck) {
    if (!r.paidAt || r.paidAt > cutoff) continue
    try {
      await write({
        address: contracts().market,
        abi: presageMarketAbi,
        functionName: 'refundUndelivered',
        args: [r.requestId as Hex],
        label: `refund undelivered request ${r.requestId.slice(0, 10)}`,
      })
      await db
        .update(schema.oracleRequests)
        .set({ status: 'refunded' })
        .where(eq(schema.oracleRequests.requestId, r.requestId))
    } catch (e) {
      l.warn(`refund for ${r.requestId.slice(0, 10)} failed: ${errMsg(e)}`)
    }
  }
}
