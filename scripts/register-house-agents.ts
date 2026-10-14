// Registers Presage's two house agents: mints each an ERC-8004 identity from the deployer wallet and
// seals its spec in PresageAgents. Safe to re-run: agents already in the database are skipped.
//
//   npx tsx scripts/register-house-agents.ts
import '../engine/env'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createWalletClient, fallback, http, keccak256, parseEventLogs, stringToBytes, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { eq } from 'drizzle-orm'
import { identityRegistryAbi } from '../lib/abi/erc8004'
import { presageAgentsAbi } from '../lib/abi/PresageAgents'
import { chain, deployment, erc8004, isMainnet, publicClient, rpcUrls } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { HORIZONS, ORACLE_CALL_PRICE_USD6 } from '../lib/oracle'
import { SETTINGS, SIGNAL } from '../engine/stquant/settings.js'

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
if (!deployment) throw new Error('No deployment for this network; run the deploy script first')
if (!site || (isMainnet && /localhost|127\.0\.0\.1/.test(site))) throw new Error('Set NEXT_PUBLIC_SITE_URL to the public site first')

const account = privateKeyToAccount(process.env.PRESAGE_DEPLOYER_KEY as Hex)
const wallet = createWalletClient({ account, chain, transport: fallback(rpcUrls.map(u => http(u))) })

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])]))
      : v

const rubricSha256 = createHash('sha256').update(readFileSync(new URL('../engine/stquant/RUBRIC.md', import.meta.url))).digest('hex')

const HOUSE = [
  {
    slug: 'oracle',
    name: 'Presage Market Oracle',
    kind: 'direction' as const,
    kindCode: 1,
    priceUsd6: 0,
    callPriceUsd6: ORACLE_CALL_PRICE_USD6,
    description:
      'Ask which way a major coin goes over 1 hour, 4 hours or 24 hours. Each answer is a majority vote of a deterministic quant model and language models, sealed on Metis before the horizon starts and scored against Binance prices after it ends.',
    spec: {
      v: 1,
      agent: 'presage-oracle',
      kind: 'direction',
      method:
        'Majority vote of presage-quant-v1 (momentum against stretch, deterministic) and the language models available to the operator, each given the same facts computed from public Binance candles. The voters behind every call are listed in that call.',
      facts: ['returns 1h/4h/24h/7d', 'EMA20 vs EMA50 on 1h and 4h', 'MFI on 15m/1h/4h with percentile', 'ATR', 'pattern support', 'first major resistance', '1h bullish divergence', 'volume vs weekly average', 'BTC context'],
      horizons: HORIZONS,
      prices: 'binance:<SYMBOL>USDT, 1-minute closes',
      rules: 'presage/direction-v1',
      payment: '$0.05 per call over x402, escrowed in PresageMarket until the call is revealed',
    },
  },
  {
    slug: 'st-quant',
    name: 'ST Quant',
    kind: 'setup' as const,
    kindCode: 2,
    priceUsd6: 3_000_000,
    callPriceUsd6: 0,
    description:
      'Buys support when money flow is exhausted: 15-minute MFI at an extreme on a level confirmed across higher timeframes. Trades BSC and X Layer pools. Unproven: ST Quant has never been shown to be profitable, and this record starts on day one.',
    spec: {
      v: 1,
      agent: 'presage-st-quant',
      kind: 'setup',
      method:
        'Publishes armed plans (armPlan) and sniper fires (sniperSignal) that an AI chart read approves under the founder rubric. Entry, stop and target are always the deterministic ones; the model can only approve or veto.',
      settings: SETTINGS,
      signal: SIGNAL,
      rubricSha256,
      universe:
        'GeckoTerminal trending and top pools on bsc and x-layer: liquidity >= $120k, 24h volume >= $200k, volume/liquidity >= 0.08; no wrapped, pegged, staked or tokenised assets; at most 24 pools',
      rules: 'presage/setup-v1',
      status: 'Unproven. ST Quant has never been shown to be profitable; this record starts on day one.',
    },
  },
]

async function send(address: Hex, abi: readonly unknown[], functionName: string, args: unknown[]) {
  const gasPrice = ((await publicClient.getGasPrice()) * 12n) / 10n
  const hash = await wallet.writeContract({ address, abi: abi as never, functionName: functionName as never, args: args as never, gasPrice, type: 'legacy' } as never)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${hash}`)
  return receipt
}

async function main() {
  const db = getDb()
  for (const h of HOUSE) {
    if (db.select().from(schema.agents).where(eq(schema.agents.slug, h.slug)).get()) {
      console.log(`${h.slug}: already registered`)
      continue
    }
    const specJson = JSON.stringify(sortKeys(h.spec))
    const specHash = keccak256(stringToBytes(specJson))
    const agentURI = `${site}/api/agents/${h.slug}/card`

    const minted = await send(erc8004.identity, identityRegistryAbi, 'register', [agentURI])
    const reg = parseEventLogs({ abi: identityRegistryAbi, eventName: 'Registered', logs: minted.logs })[0]
    const id = Number(reg.args.agentId)
    console.log(`${h.slug}: ERC-8004 identity #${id} (${minted.transactionHash})`)

    const registered = await send(deployment!.agents, presageAgentsAbi, 'register', [
      BigInt(id),
      h.kindCode,
      specHash,
      `${site}/api/specs/${specHash}`,
      BigInt(h.priceUsd6),
      BigInt(h.callPriceUsd6),
    ])
    const block = await publicClient.getBlock({ blockNumber: registered.blockNumber })
    db.insert(schema.agents)
      .values({
        id,
        slug: h.slug,
        name: h.name,
        kind: h.kind,
        house: true,
        creator: account.address.toLowerCase(),
        description: h.description,
        specJson,
        specHash,
        priceUsd6: h.priceUsd6,
        callPriceUsd6: h.callPriceUsd6,
        registeredTx: registered.transactionHash,
        registeredAt: Number(block.timestamp),
        createdAt: Math.floor(Date.now() / 1000),
      })
      .run()
    console.log(`${h.slug}: sealed spec ${specHash} in PresageAgents (${registered.transactionHash})`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
