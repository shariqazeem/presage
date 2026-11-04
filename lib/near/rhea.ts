import { RHEA_ID, type Coin } from './config'
import { view } from './rpc'

/**
 * Rhea quotes, hop by hop, from each pool's own `get_return` view: the same math its swap runs,
 * fees included, at the latest final block.
 */
export async function quotePath(path: string[], pools: number[], amountIn: bigint): Promise<bigint> {
  let amount = amountIn
  for (let i = 0; i < pools.length; i++) {
    amount = BigInt(await view<string>(RHEA_ID, 'get_return', { pool_id: pools[i], token_in: path[i], amount_in: amount.toString(), token_out: path[i + 1] }))
  }
  return amount
}

/** USDC in, coin out. */
export const quoteBuy = (coin: Coin, usdcIn: bigint) => quotePath(coin.path, coin.pools, usdcIn)

/** Coin in, USDC out: the same route backwards. */
export const quoteSell = (coin: Coin, coinIn: bigint) => quotePath([...coin.path].reverse(), [...coin.pools].reverse(), coinIn)
