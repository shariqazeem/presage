import { Account, FailoverRpcProvider, JsonRpcProvider, actions, type KeyPairString } from 'near-api-js'
import { AGENT_ID, NEAR_RPCS, VAULT_ID } from '../../lib/near/config'
import { nearBalance } from '../../lib/near/rpc'
import { vaultEvents, type VaultEvent } from '../../lib/near/vault'
import { need } from '../env'

/**
 * The agent's own NEAR account. Its key on the server is a function-call key that can only call
 * `trade`, `seal`, `reveal` and `recover` on the vault, and can't attach deposits: it can't move
 * NEAR or tokens anywhere, even if the server is compromised.
 */

let account: Account | null = null

function agent(): Account {
  if (account) return account
  const provider = new FailoverRpcProvider(NEAR_RPCS.map(url => new JsonRpcProvider({ url })))
  account = new Account(AGENT_ID, provider, need('NEAR_AGENT_KEY') as KeyPairString)
  return account
}

export const agentConfigured = () => Boolean(process.env.NEAR_AGENT_KEY)

// NEAR holds a call's whole attached gas up front, at 0.001 NEAR per Tgas (Nov 2026), and returns what
// isn't burnt (a trade burns about 0.02 NEAR). A 300 Tgas trade therefore needs 0.3 NEAR free just to
// start, on top of the account's own storage.
const HOLD_PER_TGAS = 10n ** 21n
const STORAGE_FLOOR = 10n ** 22n

const nearText = (y: bigint) => `${(Number(y / 10n ** 20n) / 10_000).toFixed(3)} NEAR`

/**
 * Why the agent can't afford a call with this much gas, keeping `reserve` NEAR spare (so open trades
 * can always be closed), or null when it can.
 */
export async function gasShortfall(gasTgas: number, reserve = 0): Promise<string | null> {
  const balance = await nearBalance(AGENT_ID)
  const need = BigInt(gasTgas) * HOLD_PER_TGAS + STORAGE_FLOOR + BigInt(Math.round(reserve * 1000)) * 10n ** 21n
  return balance >= need ? null : `${AGENT_ID} holds ${nearText(balance)} and needs ${nearText(need)} free for gas`
}

export type CallResult = { hash: string; ok: boolean; events: VaultEvent[]; value: unknown; failure: string | null }

type Status = { SuccessValue?: string; Failure?: unknown }

/** Calls the vault as the agent and waits until every receipt the call started has run. */
export async function agentCall(methodName: string, args: Record<string, unknown>, gasTgas = 300): Promise<CallResult> {
  const r = await agent()
    .signAndSendTransaction({
      receiverId: VAULT_ID,
      actions: [actions.functionCall(methodName, args, BigInt(gasTgas) * 10n ** 12n, 0n)],
      waitUntil: 'FINAL',
      throwOnFailure: false,
    })
    .catch(async (e: unknown) => {
      // NEAR refuses the transaction before it runs when the gas hold doesn't fit; say why plainly.
      const short = await gasShortfall(gasTgas).catch(() => null)
      throw short ? new Error(`Can't ${methodName}: ${short}. Send it some NEAR.`) : e
    })
  const res = r as unknown as {
    transaction: { hash: string }
    status: Status
    receipts_outcome: { outcome: { logs: string[]; status: Status; executor_id: string } }[]
  }
  const logs = res.receipts_outcome.filter(o => o.outcome.executor_id === VAULT_ID).flatMap(o => o.outcome.logs)
  const failed = res.receipts_outcome.find(o => o.outcome.status.Failure)
  let value: unknown = null
  if (res.status.SuccessValue) {
    try {
      value = JSON.parse(Buffer.from(res.status.SuccessValue, 'base64').toString('utf8'))
    } catch {
      value = null
    }
  }
  return {
    hash: res.transaction.hash,
    ok: !res.status.Failure,
    events: vaultEvents(logs),
    value,
    failure: res.status.Failure ? JSON.stringify(res.status.Failure) : failed ? JSON.stringify(failed.outcome.status.Failure) : null,
  }
}
