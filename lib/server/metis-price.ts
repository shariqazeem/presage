import { deployment, publicClient } from '../chain'

const feedAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

let cached: { at: number; price: number | null } = { at: 0, price: null }

/** METIS in USD from the same Chainlink feed the contract uses, cached five minutes. Null while unknown. */
export function metisUsd(): number | null {
  if (Date.now() - cached.at < 5 * 60_000) return cached.price
  cached = { at: Date.now(), price: cached.price }
  if (!deployment) return null
  publicClient
    .readContract({ address: deployment.metisUsdFeed, abi: feedAbi, functionName: 'latestRoundData' })
    .then(([, answer]) => {
      cached = { at: Date.now(), price: Number(answer) / 1e8 }
    })
    .catch(() => undefined)
  return cached.price
}

// Prime the cache as soon as the server loads, so the first page already has a price.
metisUsd()
