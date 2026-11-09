import type { Blocks, StrategyIntent } from './strategy'

/**
 * Calls the strategy API with a request signed by the member's account (NEP-413): the built-in account
 * signs silently; a connected wallet asks once.
 */

export type UnlockedStrategy = { id: string; name: string; owner: string | null; house: boolean; public: boolean; adopted: boolean; blocks: Blocks; traits: string[]; settings?: string[] }
type Sign = (message: string) => Promise<{ accountId: string; publicKey: string; signature: string; nonce: string; message: string }>

export async function strategyCall<T = { strategy: UnlockedStrategy }>(sign: Sign, account: string, action: StrategyIntent['action'], extra: Partial<StrategyIntent> = {}): Promise<T> {
  const intent: StrategyIntent = { app: 'parallaxpay', action, account, at: Math.floor(Date.now() / 1000), ...extra }
  const signed = await sign(JSON.stringify(intent))
  const r = await fetch(action === 'teach' ? '/api/near/strategy/teach' : '/api/near/strategy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, signed }) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? 'That didn’t go through. Try again.')
  return body as T
}

const KEY = (account: string) => `parallaxpay_strategy_${account}`

/** The member's strategy with its settings, kept on this device after they've signed for it once. */
export function cachedStrategy(account: string): UnlockedStrategy | null {
  try {
    const s = localStorage.getItem(KEY(account))
    return s ? (JSON.parse(s) as UnlockedStrategy) : null
  } catch {
    return null
  }
}
export function cacheStrategy(account: string, s: UnlockedStrategy) {
  try {
    localStorage.setItem(KEY(account), JSON.stringify(s))
  } catch {}
}
