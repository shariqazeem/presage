import { binanceLastClose } from '../lib/market/binance'
import { deployment, isMainnet } from '../lib/chain'
import { log } from './log'
import { write } from './tx'

const l = log('testnet')

const manualFeedAbi = [
  { type: 'function', name: 'set', stateMutability: 'nonpayable', inputs: [{ name: 'answer', type: 'int256' }], outputs: [] },
] as const

/**
 * Metis Sepolia has no Chainlink METIS/USD, so the testnet deployment uses a manual feed that goes
 * stale after 25 hours. This keeps it current from Binance. Never runs on mainnet.
 * The feed's owner is the deployer, so the runner can only do this if it was made the feed's owner.
 */
export async function keepTestnetFeedFresh(): Promise<void> {
  if (isMainnet || !deployment) return
  const { price } = await binanceLastClose('METISUSDT')
  try {
    await write({
      address: deployment.metisUsdFeed,
      abi: manualFeedAbi,
      functionName: 'set',
      args: [BigInt(Math.round(price * 1e8))],
      label: `testnet METIS/USD feed → $${price}`,
    })
  } catch {
    l.warn('could not update the testnet feed; is the runner its owner?')
  }
}
