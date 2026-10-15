// Rehearsal only (refuses to run without PRESAGE_REHEARSAL=1): seal a backdated Oracle call whose
// horizon has passed, resolve it from real Binance prices, and read the record back from the chain.
import '../../engine/env'
if (process.env.PRESAGE_REHEARSAL !== "1") throw new Error('Rehearsal script: set PRESAGE_REHEARSAL=1 against a local fork')
const { publishCall } = await import('../../engine/calls')
const { resolveDue } = await import('../../engine/resolver')
const { binanceCloseAt } = await import('../../lib/market/binance')
const { publicClient, deployment } = await import('../../lib/chain')
const { presageCallsAbi } = await import('../../lib/abi/PresageCalls')
const { getDb, schema } = await import('../../lib/db')
const { eq } = await import('drizzle-orm')

const oracle = getDb().select().from(schema.agents).where(eq(schema.agents.slug, 'oracle')).get()!
const issuedAt = Math.floor(Date.now() / 1000) - 2 * 3600
const open = await binanceCloseAt('SOLUSDT', issuedAt)
const row = await publishCall({
  revealBy: Math.floor(Date.now() / 1000) + 3600,
  payload: {
    v: 1, rules: 'presage/direction-v1', agent: oracle.id,
    asset: { symbol: 'SOL', source: 'binance', market: 'SOLUSDT' },
    direction: 'up', confidence: 55, horizonSec: 3600, issuedAt, priceAtIssue: open!.price, flatBandBps: 10,
    why: 'Rehearsal call, backdated so it can be scored at once.', models: [{ model: 'rehearsal', direction: 'up', confidence: 55 }],
  },
})
console.log(`sealed call #${row.chainCallId}, SOL up from ${open!.price} at ${new Date(issuedAt * 1000).toISOString()}`)
await resolveDue()
const after = getDb().select().from(schema.calls).where(eq(schema.calls.id, row.id)).get()!
console.log(`resolver: ${after.status} ${after.outcome} ${after.result}bps reveal ${after.revealTx?.slice(0, 12)}…`)
const onchain = await publicClient.readContract({ address: deployment!.calls, abi: presageCallsAbi, functionName: 'getCall', args: [BigInt(row.chainCallId!)] })
const rec = await publicClient.readContract({ address: deployment!.calls, abi: presageCallsAbi, functionName: 'recordOf', args: [BigInt(oracle.id)] })
console.log(`chain: status=${['None', 'Sealed', 'Revealed', 'Forfeited'][onchain.status]} outcome=${['None', 'Win', 'Loss', 'Flat', 'NoFill'][onchain.outcome]} result=${onchain.result}`)
console.log(`Oracle record on chain: total=${rec.total} revealed=${rec.revealed} wins=${rec.wins} losses=${rec.losses} flats=${rec.flats} sum=${rec.resultSum}`)
process.exit(0)
