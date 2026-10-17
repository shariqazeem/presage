import {
  createWalletClient,
  encodeFunctionData,
  fallback,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chain, publicClient, rpcUrls } from '../lib/chain'
import { need } from './env'
import { errMsg, log } from './log'

const l = log('tx')

export const runner = privateKeyToAccount(need('CALLED_RUNNER_KEY') as Hex)

const wallet = createWalletClient({
  account: runner,
  chain,
  transport: fallback(rpcUrls.map(url => http(url, { timeout: 20_000 }))),
})

let queue: Promise<unknown> = Promise.resolve()
let nextNonce: number | null = null

export type DecodedLog = { eventName: string; args: Record<string, unknown> }
export type Sent = { hash: Hex; receipt: TransactionReceipt; logs: DecodedLog[] }

/**
 * Send one contract call from the runner and wait for it to land. Calls are strictly serialised, so
 * nonces never collide. Metis wants legacy transactions, priced a little above the node's gas price.
 */
export function write<const TAbi extends Abi>(args: {
  address: Address
  abi: TAbi
  functionName: string
  args: readonly unknown[]
  label: string
}): Promise<Sent> {
  const run = async (): Promise<Sent> => {
    const data = encodeFunctionData({ abi: args.abi as Abi, functionName: args.functionName, args: args.args as unknown[] })
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(data, attempt)
      } catch (e) {
        // Something else spent this key's nonce (a script, a restart mid-flight): re-read it and go again once.
        if (attempt === 0 && /nonce/i.test(errMsg(e))) {
          nextNonce = null
          continue
        }
        throw e
      }
    }
  }
  const send = async (data: Hex, attempt: number): Promise<Sent> => {
    try {
      if (nextNonce === null) {
        nextNonce = await publicClient.getTransactionCount({ address: runner.address, blockTag: 'pending' })
      }
      const [gasPrice, gas] = await Promise.all([
        publicClient.getGasPrice(),
        publicClient.estimateGas({ account: runner.address, to: args.address, data }),
      ])
      const hash = await wallet.sendTransaction({
        to: args.address,
        data,
        gas: (gas * 13n) / 10n,
        gasPrice: (gasPrice * 12n) / 10n,
        nonce: nextNonce,
        type: 'legacy',
      })
      nextNonce += 1
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
      if (receipt.status !== 'success') throw new Error(`${args.label} reverted in ${hash}`)
      l.info(`${args.label}`, { hash, gasUsed: receipt.gasUsed })
      const logs = parseEventLogs({ abi: args.abi as Abi, logs: receipt.logs }) as unknown as DecodedLog[]
      return { hash, receipt, logs }
    } catch (e) {
      nextNonce = null // re-read from the node next time
      if (!(attempt === 0 && /nonce/i.test(errMsg(e)))) l.error(`${args.label} failed: ${errMsg(e)}`)
      throw e
    }
  }
  const p = queue.then(run, run)
  queue = p.catch(() => undefined)
  return p
}

export async function runnerBalance(): Promise<bigint> {
  return publicClient.getBalance({ address: runner.address })
}
