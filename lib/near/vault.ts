import { VAULT_ID, tokenById } from './config'
import { view } from './rpc'

/** Types and reads for the ParallaxPay vault contract (near/vault). Amounts are base-unit strings. */

export type Rules = {
  autopilot: boolean
  /** Largest buy, USDC base units. */
  max_trade: string
  trades_per_day: number
  /** The coins it may buy. Empty means any coin the vault lists. */
  coins: string[]
  /** 0 calm (only the best setups), 1 balanced, 2 bold. */
  style: number
}

/** The vault's own limits on a member's rules. */
export const MAX_COINS = 8
export const MAX_BUYS_PER_DAY = 48

/**
 * How much of a member's largest buy each style puts into a setup, by the setup's grade out of 5.
 * A grade a style doesn't list is a pass. The agent sizes real trades with this, and the app uses it
 * to show what the agent would do for a mandate that isn't funded yet.
 */
export const STYLE_SHARE: Record<number, Record<number, number>> = {
  0: { 5: 1 },
  1: { 5: 1, 4: 0.7 },
  2: { 5: 1, 4: 0.7, 3: 0.5 },
}
export const STYLE_NAMES = ['calm', 'balanced', 'bold'] as const

/** Whether a member's rules let the agent buy this coin: any listed coin when their list is empty. */
export const allowsCoin = (rules: Pick<Rules, 'coins'>, coinId: string) => rules.coins.length === 0 || rules.coins.includes(coinId)

/** A member's coins in words: "NEAR, ZEC and RHEA", or "any coin it finds". */
export function coinsInWords(ids: string[], any = 'any coin it finds'): string {
  if (!ids.length) return any
  const names = ids.map(id => tokenById(id)?.symbol ?? id)
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export type Member = {
  balances: Record<string, string>
  rules: Rules
  buys_today: number
  joined_at: string
}

export type Route = { path: string[]; pools: number[] }

export type VaultConfig = {
  owner: string
  agent: string
  exchange: string
  usdc: string
  paused: boolean
  routes: Route[]
  members: number
  calls: number
  trades: number
}

export type Stage = 'Depositing' | { Swapping: { amount: string } } | { Returning: { token: string; amount: string; filled: boolean } }

export type RunningTrade = {
  id: number
  account_id: string
  by_agent: boolean
  path: string[]
  pools: number[]
  amount_in: string
  min_out: string
  call: number | null
  stage: Stage
  started_at: string
}

export type SealedCall = {
  id: number
  account_id: string
  hash: string
  sealed_at: string
  sealed_block: string
  opened_at: string | null
}

export const vault = {
  config: () => view<VaultConfig>(VAULT_ID, 'get_config'),
  member: (accountId: string) => view<Member | null>(VAULT_ID, 'get_member', { account_id: accountId }),
  call: (id: number) => view<SealedCall | null>(VAULT_ID, 'get_call', { id }),
  calls: (from: number, limit: number) => view<SealedCall[]>(VAULT_ID, 'get_calls', { from, limit }),
  trade: () => view<RunningTrade | null>(VAULT_ID, 'get_trade'),
  totals: () => view<Record<string, string>>(VAULT_ID, 'get_totals'),
}

export type VaultEvent = { event: string; data: Record<string, unknown> }

/** The vault's NEP-297 events in a transaction's logs. */
export function vaultEvents(logs: string[]): VaultEvent[] {
  const out: VaultEvent[] = []
  for (const line of logs) {
    if (!line.startsWith('EVENT_JSON:')) continue
    try {
      const e = JSON.parse(line.slice('EVENT_JSON:'.length)) as { standard?: string; event: string; data: Record<string, unknown>[] }
      if (e.standard === 'parallaxpay') for (const data of e.data) out.push({ event: e.event, data })
    } catch {
      // Not ours, or not JSON.
    }
  }
  return out
}

/** Only the events the vault itself wrote: another contract in the same transaction could log look-alikes. */
export const eventsFromVault = (logsBy: { executor: string; logs: string[] }[]): VaultEvent[] => vaultEvents(logsBy.filter(r => r.executor === VAULT_ID).flatMap(r => r.logs))

/** How a trade ended, from its `trade_end` event. */
export type TradeEnd = {
  id: number
  account_id: string
  by_agent: boolean
  outcome: 'filled' | 'refunded' | 'not_sent'
  token_in: string
  token_out: string
  amount_in: string
  amount_out: string
  call: number | null
}

export const tradeEnd = (events: VaultEvent[]): TradeEnd | null => (events.find(e => e.event === 'trade_end')?.data as TradeEnd | undefined) ?? null
