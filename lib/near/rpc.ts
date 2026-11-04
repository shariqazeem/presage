import { NEAR_RPCS } from './config'

/**
 * A small NEAR JSON-RPC client for reads, usable in the browser and on the server. It moves to the
 * next public RPC only when one is unreachable; an answer that is an error is final.
 */

class RpcAnswerError extends Error {}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let lastErr: unknown
  for (const url of NEAR_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'parallaxpay', method, params }),
        signal: AbortSignal.timeout(12_000),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`${url} answered ${res.status}`)
      const body = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown; cause?: { name?: string } } }
      if (body.error) throw new RpcAnswerError(body.error.cause?.name ?? String(body.error.data ?? body.error.message))
      return body.result as T
    } catch (e) {
      if (e instanceof RpcAnswerError) throw e
      lastErr = e
    }
  }
  throw lastErr
}

const toBase64 = (s: string) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(s))

/** Calls a view method and parses its JSON result. */
export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const r = await rpc<{ result?: number[]; error?: string }>('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  })
  if (r.error) throw new Error(r.error)
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result ?? []))) as T
}

export async function accountExists(accountId: string): Promise<boolean> {
  try {
    await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId })
    return true
  } catch (e) {
    if (e instanceof RpcAnswerError) return false
    throw e
  }
}

export async function nearBalance(accountId: string): Promise<bigint> {
  const r = await rpc<{ amount: string }>('query', { request_type: 'view_account', finality: 'final', account_id: accountId })
  return BigInt(r.amount)
}

export const ftBalance = async (token: string, accountId: string) => BigInt(await view<string>(token, 'ft_balance_of', { account_id: accountId }))

export const storageRegistered = async (token: string, accountId: string) =>
  (await view<{ total: string } | null>(token, 'storage_balance_of', { account_id: accountId })) != null

export type TxOutcome = {
  hash: string
  ok: boolean
  logs: string[]
  /** Logs grouped by the account whose code wrote them, so events can be trusted by their source. */
  logsBy: { executor: string; logs: string[] }[]
  /** The last receipt's return value, decoded from base64 when present. */
  value: string | null
  failure: string | null
}

/** A finished transaction: whether every receipt succeeded, and every log it wrote. */
export async function txOutcome(hash: string, senderId: string): Promise<TxOutcome> {
  type Status = { SuccessValue?: string; Failure?: unknown; SuccessReceiptId?: string }
  const r = await rpc<{
    status: Status
    receipts_outcome: { outcome: { logs: string[]; status: Status; executor_id: string } }[]
  }>('tx', { tx_hash: hash, sender_account_id: senderId, wait_until: 'FINAL' })
  const failed = r.receipts_outcome.find(o => o.outcome.status.Failure)
  const value = r.status.SuccessValue != null ? (typeof Buffer !== 'undefined' ? Buffer.from(r.status.SuccessValue, 'base64').toString('utf8') : atob(r.status.SuccessValue)) : null
  return {
    hash,
    ok: !r.status.Failure,
    logs: r.receipts_outcome.flatMap(o => o.outcome.logs),
    logsBy: r.receipts_outcome.map(o => ({ executor: o.outcome.executor_id, logs: o.outcome.logs })),
    value,
    failure: r.status.Failure ? JSON.stringify(r.status.Failure) : failed ? JSON.stringify(failed.outcome.status.Failure) : null,
  }
}
