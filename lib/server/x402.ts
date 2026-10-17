import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { parseEventLogs, toHex, type Address, type Hex } from 'viem'
import { presageMarketAbi } from '../abi/PresageMarket'
import { caip2, deployment, payTokens, publicClient, txUrl } from '../chain'
import { getDb, schema } from '../db'
import { HORIZONS, isHorizon, ORACLE_SYMBOLS, type Horizon } from '../oracle'
import { parsePayload } from '../calls/payload'
import { llmConfigured, models } from '../llm'

/**
 * x402 for the Oracle. Metis has no public x402 facilitator, and m.USDC and m.USDT support neither
 * EIP-3009 nor permit, so Presage settles the payment itself: the payer's wallet calls
 * PresageMarket.payForCall, which escrows the money, and the request is retried with the transaction
 * hash in X-PAYMENT. The scheme is called "escrow" because that is what it is: the payment is released
 * to the agent only once the call is revealed, and refunded if it never gets sealed or is forfeited.
 */
export const X402_VERSION = 1
export const SCHEME = 'escrow'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function oracleAgentId(): number | null {
  return getDb().select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.slug, 'oracle')).get()?.id ?? null
}

export type PaymentRequirements = {
  scheme: typeof SCHEME
  network: string
  maxAmountRequired: string
  resource: string
  description: string
  mimeType: 'application/json'
  payTo: Address
  maxTimeoutSeconds: number
  asset: Address
  extra: {
    contract: Address
    method: 'payForCall(uint256,bytes32,address,uint256)'
    agentId: number
    requestId: Hex
    symbol: string
    decimals: number
    native: boolean
    escrow: string
  }
}

export async function quoteOracleCall(input: { asset: string; horizon: string; wallet?: string | null; myCall?: string | null; resource: string }) {
  if (!deployment) throw new HttpError(503, 'Presage is not deployed on this network yet')
  const agentId = oracleAgentId()
  if (agentId == null) throw new HttpError(503, 'The Oracle agent is not registered yet')
  const asset = input.asset.toUpperCase()
  if (!ORACLE_SYMBOLS.has(asset)) throw new HttpError(400, `The Oracle does not cover ${asset}`)
  if (!isHorizon(input.horizon)) throw new HttpError(400, 'horizon must be 1h, 4h or 24h')
  const horizon: Horizon = input.horizon
  const myCall = input.myCall === 'up' || input.myCall === 'down' ? input.myCall : null

  const requestId = toHex(randomBytes(32))
  const secret = randomBytes(24).toString('base64url')

  const quotes = await Promise.all(
    payTokens.map(async t => {
      try {
        const amount = await publicClient.readContract({
          address: deployment!.market,
          abi: presageMarketAbi,
          functionName: 'callQuote',
          args: [BigInt(agentId), t.address],
        })
        return { t, amount }
      } catch {
        return null // e.g. METIS while the price feed is stale: the stablecoins still work
      }
    }),
  )

  const accepts: PaymentRequirements[] = quotes
    .filter((q): q is NonNullable<typeof q> => q != null)
    .map(({ t, amount }) => ({
      scheme: SCHEME,
      network: caip2,
      maxAmountRequired: amount.toString(),
      resource: input.resource,
      description: `One Presage Oracle call: ${asset} up or down over ${HORIZONS[horizon].label}, sealed on Metis before the outcome.`,
      mimeType: 'application/json',
      payTo: deployment!.market,
      maxTimeoutSeconds: 900,
      asset: t.address,
      extra: {
        contract: deployment!.market,
        method: 'payForCall(uint256,bytes32,address,uint256)',
        agentId,
        requestId,
        symbol: t.symbol,
        decimals: t.decimals,
        native: t.native,
        escrow:
          'Held by PresageMarket until the call is revealed, then split 80/20 between the agent creator and the platform. Refunded if the call is not sealed within 15 minutes or is forfeited.',
      },
    }))
  if (!accepts.length) throw new HttpError(503, 'Could not price a call right now; try again shortly')

  getDb()
    .insert(schema.oracleRequests)
    .values({
      requestId,
      secretHash: sha256(secret),
      wallet: input.wallet?.toLowerCase() ?? null,
      asset,
      horizon,
      askerCall: myCall,
      status: 'quoted',
      createdAt: Math.floor(Date.now() / 1000),
    })
    .run()

  // Who will vote, so the asker sees the panel fill in rather than appear.
  const voters = ['presage-quant-v1', ...(llmConfigured() ? models.oracle() : [])]
  return { x402Version: X402_VERSION, error: 'X-PAYMENT header is required', accepts, requestId, secret, voters }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

type PaymentHeader = { x402Version: number; scheme: string; network: string; payload: { requestId: Hex; txHash: Hex } }

export function decodePaymentHeader(h: string): PaymentHeader {
  try {
    const p = JSON.parse(Buffer.from(h, 'base64').toString('utf8')) as PaymentHeader
    if (p.scheme !== SCHEME || p.network !== caip2 || !/^0x[0-9a-fA-F]{64}$/.test(p.payload?.txHash ?? '')) throw new Error()
    return p
  } catch {
    throw new HttpError(400, `X-PAYMENT must be base64 JSON {x402Version, scheme:"${SCHEME}", network:"${caip2}", payload:{requestId, txHash}}`)
  }
}

/** Check the payment on chain: the transaction must hold a CallPaid event for this request. */
export async function verifyPayment(requestId: Hex, secret: string, txHash: Hex) {
  if (!deployment) throw new HttpError(503, 'Presage is not deployed on this network yet')
  const db = getDb()
  const req = db.select().from(schema.oracleRequests).where(eq(schema.oracleRequests.requestId, requestId)).get()
  if (!req) throw new HttpError(404, 'Unknown request')
  if (req.secretHash !== sha256(secret)) throw new HttpError(403, 'Wrong secret for this request')
  if (req.status !== 'quoted') return req

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 })
  if (receipt.status !== 'success') throw new HttpError(402, 'The payment transaction failed')
  const paid = parseEventLogs({
    abi: presageMarketAbi,
    eventName: 'CallPaid',
    logs: receipt.logs.filter(l => l.address.toLowerCase() === deployment!.market.toLowerCase()),
  }).find(e => e.args.requestId.toLowerCase() === requestId.toLowerCase())
  if (!paid) throw new HttpError(402, 'That transaction did not pay for this request')
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })

  db.update(schema.oracleRequests)
    .set({
      status: 'paid',
      payTx: txHash,
      payer: paid.args.payer.toLowerCase(),
      token: paid.args.token,
      amount: paid.args.amount.toString(),
      paidAt: Number(block.timestamp),
    })
    .where(eq(schema.oracleRequests.requestId, requestId))
    .run()
  return db.select().from(schema.oracleRequests).where(eq(schema.oracleRequests.requestId, requestId)).get()!
}

/** The answer to a paid request, once the engine has sealed it. */
export function oracleAnswer(requestId: Hex, secret: string) {
  const db = getDb()
  const req = db.select().from(schema.oracleRequests).where(eq(schema.oracleRequests.requestId, requestId)).get()
  if (!req) throw new HttpError(404, 'Unknown request')
  if (req.secretHash !== sha256(secret)) throw new HttpError(403, 'Wrong secret for this request')
  const base = {
    requestId,
    status: req.status,
    asset: req.asset,
    horizon: req.horizon,
    payTx: req.payTx,
    error: req.error,
    progress: req.status === 'answering' && req.progress ? (JSON.parse(req.progress) as unknown) : null,
    myCall: req.askerCall ?? null,
    createdAt: req.createdAt,
    paidAt: req.paidAt,
  }
  if (req.status !== 'sealed' || req.callId == null) return { ...base, call: null }
  const call = db.select().from(schema.calls).where(eq(schema.calls.id, req.callId)).get()
  if (!call) return { ...base, call: null }
  const p = parsePayload(call.payload)
  if (p.rules !== 'presage/direction-v1') throw new HttpError(500, 'Unexpected call type')
  return {
    ...base,
    call: {
      id: call.id,
      chainCallId: call.chainCallId,
      status: call.status,
      sealTx: call.sealTx,
      sealTxUrl: call.sealTx ? txUrl(call.sealTx) : null,
      sealedAt: call.sealedAt,
      revealBy: call.revealBy,
      outcome: call.outcome,
      result: call.result,
      asset: p.asset.symbol,
      market: p.asset.source === 'binance' ? p.asset.market : null,
      direction: p.direction,
      confidence: p.confidence,
      horizonSec: p.horizonSec,
      priceAtIssue: p.priceAtIssue,
      issuedAt: p.issuedAt,
      flatBandBps: p.flatBandBps,
      why: p.why,
      detail: p.detail ?? null,
      models: p.models,
      exitPrice: call.resolution ? ((JSON.parse(call.resolution) as { exitPrice?: number }).exitPrice ?? null) : null,
      revealedAt: call.revealedAt,
      receipt: `/calls/${call.id}`,
    },
  }
}

export function paymentResponseHeader(req: { payTx: string | null; payer: string | null }) {
  return Buffer.from(JSON.stringify({ success: true, transaction: req.payTx, network: caip2, payer: req.payer })).toString('base64')
}
