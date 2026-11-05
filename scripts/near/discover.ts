/**
 * Finds every coin ParallaxPay can trade on Rhea and writes them to lib/near/coins.json, with their
 * icons in public/tokens/.
 *
 * A coin qualifies when:
 * - it has a classic Rhea pool (the kind the vault swaps through) against wNEAR or native USDC, with at
 *   least $5k of liquidity, and that pool's fee is under 1%;
 * - it isn't a stablecoin or a staked-NEAR wrapper (nothing to trade there);
 * - it traded in the last day: a chart nobody trades has nothing to read.
 * Deep liquidity isn't required. The agent sizes each buy to the pool it trades through.
 *
 *   npx tsx scripts/near/discover.ts [--min-tvl 5000] [--min-tx 5] [--dry]
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { RHEA_ID, USDC_ID, WNEAR_ID } from '../../lib/near/config'
import { view } from '../../lib/near/rpc'

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const MIN_TVL = Number(arg('min-tvl', '5000'))
const MIN_TX = Number(arg('min-tx', '5'))
const DRY = process.argv.includes('--dry')

/** Stablecoins and staked NEAR: they barely move, so there is nothing for the agent to trade. */
const SKIP_IDS = new Set([
  'usdt.tether-token.near',
  'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near', // USDT.e
  'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near', // USDC.e
  '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near', // DAI
  '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near', // FRAX
  'meta-pool.near', // stNEAR
  'linear-protocol.near', // LiNEAR
  'lst.rhealab.near', // rNEAR
  'v2-nearx.stader-labs.near', // NEARX
  'usn',
])
const STABLE = /^(usd|usdt|usdc|dai|frax|usn|cusd|tusd|busd|usde|eurc)/i

/** Coins with a deep Binance market are read from Binance; the rest from their own Rhea pool. */
const BINANCE: Record<string, string> = {
  [WNEAR_ID]: 'NEARUSDT',
  'zec.omft.near': 'ZECUSDT',
  aurora: 'ETHUSDT',
  'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near': 'ETHUSDT',
  '2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near': 'BTCUSDT',
  'nbtc.bridge.near': 'BTCUSDT',
  'sol.token.a11bd.near': 'SOLUSDT',
  '22.contract.portalbridge.near': 'SOLUSDT',
  'wbnb.hot.tg': 'BNBUSDT',
}

type RheaPool = { id: string; pool_kind: string; token_account_ids: string[]; token_symbols: string[]; tvl: string; total_fee: number }
type Meta = { symbol: string; name: string; decimals: number; icon?: string | null }
type GtPool = { attributes: { address: string; reserve_in_usd: string; volume_usd: { h24: string }; transactions: { h24: { buys: number; sells: number } } } }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log(`Rhea pools… (min liquidity $${MIN_TVL}, min ${MIN_TX} trades a day)`)
  const pools = (await (await fetch('https://api.rhea.finance/list-pools')).json()) as RheaPool[]
  const best = new Map<string, { pool: number; base: string; tvl: number; fee: number }>()
  for (const p of pools) {
    if (p.pool_kind !== 'SIMPLE_POOL' || p.token_account_ids.length !== 2) continue
    const tvl = Number(p.tvl || 0)
    if (!(tvl >= MIN_TVL) || p.total_fee >= 100) continue
    const [a, b] = p.token_account_ids
    const base = [a, b].find(t => t === WNEAR_ID || t === USDC_ID)
    const token = base === a ? b : a
    if (!base || token === WNEAR_ID || token === USDC_ID || SKIP_IDS.has(token)) continue
    const cur = best.get(token)
    if (!cur || tvl > cur.tvl) best.set(token, { pool: Number(p.id), base, tvl, fee: p.total_fee })
  }
  console.log(`  ${best.size} tokens with a deep enough classic pool`)

  // Activity from GeckoTerminal, 30 pools a request.
  const activity = new Map<number, { vol24: number; tx24: number }>()
  const ids = [...best.values()].map(b => b.pool)
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30).map(id => `refv1-${id}`)
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/near/pools/multi/${chunk.join(',')}`, { headers: { accept: 'application/json;version=20230302' } })
    if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
    for (const d of ((await r.json()) as { data: GtPool[] }).data) {
      const a = d.attributes
      const tx = a.transactions?.h24 ?? { buys: 0, sells: 0 }
      activity.set(Number(a.address.replace('refv1-', '')), { vol24: Number(a.volume_usd?.h24 ?? 0), tx24: (tx.buys ?? 0) + (tx.sells ?? 0) })
    }
    await sleep(2500)
  }

  const whitelisted = new Set(await view<string[]>(RHEA_ID, 'get_whitelisted_tokens', {}).catch(() => [] as string[]))
  const iconDir = resolve('public/tokens')
  if (!DRY) mkdirSync(iconDir, { recursive: true })
  const out: Record<string, unknown>[] = []
  const quiet: string[] = []
  for (const [id, b] of best) {
    const act = activity.get(b.pool) ?? { vol24: 0, tx24: 0 }
    let meta: Meta
    try {
      meta = await view<Meta>(id, 'ft_metadata', {})
    } catch {
      continue
    }
    const symbol = (meta.symbol || '').trim()
    if (!symbol || STABLE.test(symbol) || !(meta.decimals >= 0)) continue
    if (act.tx24 < MIN_TX && act.vol24 < 300) {
      quiet.push(symbol)
      continue
    }
    const slug = `${symbol.toLowerCase().replace(/[^a-z0-9]/g, '') || 'coin'}-${createHash('sha256').update(id).digest('hex').slice(0, 6)}`
    const icon = DRY ? null : saveIcon(meta.icon, iconDir, slug)
    out.push({
      id,
      symbol,
      name: (meta.name || symbol).trim().slice(0, 40),
      decimals: meta.decimals,
      path: b.base === WNEAR_ID ? [USDC_ID, WNEAR_ID, id] : [USDC_ID, id],
      pools: b.base === WNEAR_ID ? [4512, b.pool] : [b.pool],
      feed: BINANCE[id] ? { source: 'binance', market: BINANCE[id] } : { source: 'geckoterminal', network: 'near', pool: `refv1-${b.pool}` },
      tvl: Math.round(b.tvl),
      vol24: Math.round(act.vol24),
      tx24: act.tx24,
      fee: b.fee,
      whitelisted: whitelisted.has(id),
      ...(icon ? { icon } : {}),
    })
    await sleep(120)
  }

  // One coin per symbol: the one with the deepest pool keeps it.
  out.sort((a, b) => (b.tvl as number) - (a.tvl as number))
  const seen = new Set<string>()
  const coins = out.filter(c => {
    const k = String(c.symbol).toUpperCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  coins.sort((a, b) => (b.vol24 as number) - (a.vol24 as number))
  console.log(`  ${coins.length} coins trade (${quiet.length} too quiet: ${quiet.slice(0, 12).join(', ')}${quiet.length > 12 ? '…' : ''})`)
  for (const c of coins) console.log(`  ${String(c.symbol).padEnd(12)} pool ${String((c.pools as number[]).at(-1)).padStart(5)}  liq $${String(c.tvl).padStart(9)}  vol $${String(c.vol24).padStart(8)}  ${c.tx24} trades${c.whitelisted ? '' : '  (not on Rhea whitelist)'}`)
  if (DRY) return
  writeFileSync(resolve('lib/near/coins.json'), `${JSON.stringify({ at: new Date().toISOString().slice(0, 10), minTvl: MIN_TVL, quiet: quiet.length, coins }, null, 1)}\n`)
  console.log('Wrote lib/near/coins.json')
}

/** A token's icon as a small file: SVGs are drawn to PNG (no scripts survive), small rasters kept as they are. */
function saveIcon(icon: string | null | undefined, dir: string, slug: string): string | null {
  if (!icon?.startsWith('data:')) return null
  const m = icon.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!m) return null
  const [, type, b64, data] = m
  try {
    const bytes = b64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data))
    if (type.includes('svg')) {
      const png = new Resvg(bytes.toString('utf8'), { fitTo: { mode: 'width', value: 64 } }).render().asPng()
      writeFileSync(resolve(dir, `${slug}.png`), png)
      return `/tokens/${slug}.png`
    }
    const ext = type.includes('png') ? 'png' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : type.includes('webp') ? 'webp' : null
    if (!ext || bytes.length > 60_000) return null
    writeFileSync(resolve(dir, `${slug}.${ext}`), bytes)
    return `/tokens/${slug}.${ext}`
  } catch {
    return null
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
