import { COINS, USDC } from '../../lib/near/config'
import { quoteBuy, quoteSell } from '../../lib/near/rhea'
import { fromUnits, toUnits } from '../../lib/near/units'

// Prices $25 of each coin on Rhea right now, both ways, to check the routes and the math.
for (const coin of COINS) {
  const out = await quoteBuy(coin, toUnits(25, USDC.decimals))
  const back = await quoteSell(coin, out)
  console.log(`${coin.symbol}: $25 buys ${fromUnits(out, coin.decimals).toFixed(6)} (≈ $${(25 / fromUnits(out, coin.decimals)).toFixed(4)} each), selling it back returns $${fromUnits(back, USDC.decimals).toFixed(4)}`)
}
