import { COINS, RHEA_ID, tokenById } from './config'
import { view } from './rpc'

/**
 * Live prices straight from the Rhea pools ParallaxPay trades through, read from NEAR in one call
 * (`get_pool_by_ids`). A coin's price is its pools' reserves multiplied along its route to USDC, so
 * RHEA is priced in wNEAR by pool 6458 and wNEAR in USDC by pool 4512: the market the vault actually
 * trades at, not an outside feed. Cached for a few seconds and shared by every visitor.
 */

type Pool = { pool_kind: string; token_account_ids: string[]; amounts: string[] }
export type Live = { at: number; prices: Record<string, number> }

const TTL_MS = 4_000
let cache: Live | null = null
let loading: Promise<Live> | null = null

async function load(): Promise<Live> {
  const ids = [...new Set(COINS.flatMap(c => c.pools))]
  const pools = await view<Pool[]>(RHEA_ID, 'get_pool_by_ids', { pool_ids: ids })
  const byId = new Map(ids.map((id, i) => [id, pools[i]]))
  const decimals = (id: string) => tokenById(id)?.decimals ?? 18
  const prices: Record<string, number> = {}
  for (const c of COINS) {
    // Walk from the coin back to USDC: each hop prices one token in the one before it.
    let price = 1
    for (let i = c.pools.length - 1; i >= 0; i--) {
      const p = byId.get(c.pools[i])
      const a = c.path[i]
      const b = c.path[i + 1]
      const ia = p?.token_account_ids.indexOf(a) ?? -1
      const ib = p?.token_account_ids.indexOf(b) ?? -1
      if (!p || ia < 0 || ib < 0) {
        price = NaN
        break
      }
      const ra = Number(p.amounts[ia]) / 10 ** decimals(a)
      const rb = Number(p.amounts[ib]) / 10 ** decimals(b)
      price *= ra / rb
    }
    if (Number.isFinite(price) && price > 0) prices[c.symbol] = price
  }
  cache = { at: Date.now(), prices }
  return cache
}

export async function livePrices(): Promise<Live> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  loading ??= load().finally(() => (loading = null))
  try {
    return await loading
  } catch (e) {
    if (cache) return cache
    throw e
  }
}
