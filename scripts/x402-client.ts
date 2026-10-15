// Pay for one Presage Oracle call over x402 from any wallet: the flow another agent would follow.
//
//   PAYER_KEY=0x... npx tsx scripts/x402-client.ts BTC 4h METIS
//
// PRESAGE_API (default https://presage.trade) and METIS_RPC_URL (default Andromeda) can be overridden.
import { createPublicClient, createWalletClient, http, parseEventLogs, erc20Abi, formatUnits, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { metis } from 'viem/chains'
import { presageMarketAbi } from '../lib/abi/PresageMarket'

const [asset = 'BTC', horizon = '4h', tokenSymbol = 'METIS'] = process.argv.slice(2)
const rpc = process.env.METIS_RPC_URL ?? 'https://andromeda.metis.io/?owner=1088'
if (!process.env.PAYER_KEY) throw new Error('Set PAYER_KEY to the private key of the wallet that pays')
const account = privateKeyToAccount(process.env.PAYER_KEY as Hex)
const pub = createPublicClient({ chain: metis, transport: http(rpc) })
const wallet = createWalletClient({ account, chain: metis, transport: http(rpc) })
const api = `${(process.env.PRESAGE_API ?? 'https://presage.trade').replace(/\/$/, '')}/api/oracle/call`

const t0 = Date.now()
const r1 = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset, horizon }) })
const q = await r1.json()
console.log(`1. POST without payment → HTTP ${r1.status}, ${q.accepts?.length} ways to pay: ${q.accepts?.map((a: any) => `${formatUnits(BigInt(a.maxAmountRequired), a.extra.decimals)} ${a.extra.symbol}`).join(' | ')}`)
const req = q.accepts.find((a: any) => a.extra.symbol === tokenSymbol)
const amount = BigInt(req.maxAmountRequired)
if (!req.extra.native) {
  const h = await wallet.writeContract({ address: req.asset, abi: erc20Abi, functionName: 'approve', args: [req.payTo, amount], type: 'legacy' })
  await pub.waitForTransactionReceipt({ hash: h })
}
const max = req.extra.native ? (amount * 101n) / 100n : amount
const txHash = await wallet.writeContract({ address: req.payTo, abi: presageMarketAbi, functionName: 'payForCall', args: [BigInt(req.extra.agentId), req.extra.requestId, req.asset, max], value: req.extra.native ? max : 0n, type: 'legacy' })
const rc = await pub.waitForTransactionReceipt({ hash: txHash })
const paid = parseEventLogs({ abi: presageMarketAbi, eventName: 'CallPaid', logs: rc.logs })[0]
console.log(`2. paid ${formatUnits(paid.args.amount, req.extra.decimals)} ${tokenSymbol} into escrow, tx ${txHash.slice(0, 12)}…`)
const header = Buffer.from(JSON.stringify({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { requestId: req.extra.requestId, txHash } })).toString('base64')
const r2 = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json', 'X-PAYMENT': header }, body: JSON.stringify({ secret: q.secret }) })
const ans = await r2.json()
const pr = JSON.parse(Buffer.from(r2.headers.get('x-payment-response') ?? '', 'base64').toString() || '{}')
console.log(`3. POST with X-PAYMENT → HTTP ${r2.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s; X-PAYMENT-RESPONSE success=${pr.success} payer=${pr.payer?.slice(0, 8)}`)
if (ans.call) {
  const c = ans.call
  console.log(`   ${c.asset} ${c.direction.toUpperCase()} ${c.confidence}% over ${c.horizonSec / 3600}h from $${c.priceAtIssue}, call #${c.chainCallId} sealed ${c.sealTx.slice(0, 12)}…`)
  console.log(`   votes: ${c.models.map((m: any) => `${m.model.split('/').pop()} ${m.direction} ${m.confidence}`).join(' · ')}`)
  console.log(`   why: ${c.why.slice(0, 200)}`)
  const r = await pub.readContract({ address: req.payTo, abi: presageMarketAbi, functionName: 'getRequest', args: [req.extra.requestId] })
  console.log(`4. escrow on chain: state=${['None', 'Paid', 'Sealed', 'Settled', 'Refunded'][r.state]} callId=${r.callId} amount=${formatUnits(r.amount, req.extra.decimals)} ${tokenSymbol}`)
} else console.log('   no answer:', JSON.stringify(ans))
