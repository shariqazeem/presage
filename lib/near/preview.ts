import { USDC, USDC_ID, coinBySymbol } from './config'
import type { CoinRead, Desk } from './hooks'
import type { Plan, PositionView } from './store'
import { toUnits } from './units'

/**
 * Sample data for looking at the desk locally (`/desk?preview=1`, development builds only). It is built
 * around the live prices so the ranges and P&L read like a real account; nothing here is ever served.
 */
export function previewDesk(reads: CoinRead[]): Desk {
  const now = Math.floor(Date.now() / 1000)
  const near = coinBySymbol('NEAR')!
  const zec = coinBySymbol('ZEC')!
  const price = (id: string, fallback: number) => reads.find(r => r.token === id)?.price ?? fallback
  const pNear = price(near.id, 2.5)
  const pZec = price(zec.id, 40)
  const units = (n: number, decimals: number) => toUnits(n.toFixed(Math.min(decimals, 8)), decimals).toString()

  const plan = (symbol: string, token: string, at: number, stop: number, target: number, why: string[]): Plan => ({
    v: 1,
    rules: 'parallaxpay/near-trade-v1',
    vault: 'vault.parallaxpay.near',
    account: 'you.near',
    coin: { symbol, token, market: `${symbol}USDT` },
    side: 'buy',
    usdc: units(10, USDC.decimals),
    entry: { type: 'market', priceAtIssue: at, quoteOut: '0' },
    stop,
    target,
    r1: null,
    maxHoldSec: 72 * 3600,
    conviction: 4,
    issuedAt: now - 300,
    why,
    analyst: { provider: 'rules' },
  })

  const base = (id: number): PositionView => ({
    id,
    accountId: 'you.near',
    coin: 'NEAR',
    token: near.id,
    mode: 'ask',
    status: 'proposed',
    callId: 140 + id,
    hash: '0x' + 'ab'.repeat(32),
    planJson: null,
    plan: null,
    salt: null,
    opened: false,
    usdcIn: 10,
    usdcInRaw: units(10, USDC.decimals),
    coinAmount: null,
    coinAmountRaw: null,
    entryPrice: null,
    exitPrice: null,
    usdcOut: null,
    pnlUsd: null,
    pnlPct: null,
    stop: 0,
    target: 0,
    exitReason: null,
    exitProposed: false,
    createdAt: now - 600,
    openedAt: null,
    closedAt: null,
    txs: { seal: null, entry: null, exit: null, reveal: null },
  })

  const zecStop = +(pZec * 0.986).toFixed(2)
  const zecTarget = +(pZec * 1.036).toFixed(2)
  const proposal: PositionView = {
    ...base(9001),
    coin: 'ZEC',
    token: zec.id,
    stop: zecStop,
    target: zecTarget,
    plan: plan('ZEC', zec.id, pZec, zecStop, zecTarget, ['Money flow turned up from oversold at the daily low, with the trend still pointing up.']),
  }

  const entry = +(pNear * 0.986).toFixed(4)
  const nearQty = 10 / entry
  const open: PositionView = {
    ...base(9002),
    status: 'open',
    stop: +(entry * 0.988).toFixed(4),
    target: +(entry * 1.032).toFixed(4),
    entryPrice: entry,
    coinAmount: nearQty,
    coinAmountRaw: units(nearQty, near.decimals),
    opened: true,
    openedAt: now - 5 * 3600,
  }

  const closed = (id: number, coin: string, token: string, at: number, pnl: number, reason: string, hoursAgo: number): PositionView => {
    const entry = +(at * (1 - (pnl > 0 ? 0.03 : -0.004))).toFixed(4)
    const exit = +(entry * (1 + pnl / 10)).toFixed(4)
    const stop = +(entry * 0.988).toFixed(4)
    const target = +(entry * 1.036).toFixed(4)
    const openedAt = now - (hoursAgo + 9) * 3600
    return {
      ...base(id),
      coin,
      token,
      status: 'closed',
      opened: true,
      plan: { ...plan(coin, token, entry, stop, target, ['Price held its 1H support with money flow under 20 and turning up.']), issuedAt: openedAt - 300 },
      entryPrice: entry,
      exitPrice: exit,
      stop,
      target,
      pnlUsd: pnl,
      pnlPct: pnl / 10,
      usdcOut: 10 + pnl,
      exitReason: reason,
      createdAt: openedAt - 300,
      openedAt,
      closedAt: now - hoursAgo * 3600,
    }
  }

  return {
    account: 'you.near',
    reachable: true,
    member: {
      balances: { [USDC_ID]: units(54.3, USDC.decimals), [near.id]: units(nearQty, near.decimals) },
      rules: { autopilot: false, max_trade: units(10, USDC.decimals), trades_per_day: 2, coins: [near.id, zec.id], style: 1 },
      buys_today: 1,
      joined_at: String((now - 3 * 86400) * 1e9),
    },
    positions: [proposal, open, closed(9003, 'ZEC', zec.id, pZec, 0.36, 'hit its target', 30), closed(9004, 'NEAR', near.id, pNear, -0.12, 'hit its stop', 54)],
    feed: [
      { id: 4, at: now - 300, kind: 'propose', text: 'ZEC turned up from oversold at the daily low. Proposed $10 for you to approve.', coin: 'ZEC', tx: null, actor: 'parallaxpay', mine: true },
      { id: 3, at: now - 5 * 3600, kind: 'enter', text: 'You approved $10 of NEAR. Stop and target are set.', coin: 'NEAR', tx: null, actor: 'you.near', mine: true },
      { id: 2, at: now - 30 * 3600, kind: 'exit', text: 'ZEC reached its target. Sold back to USDC.', coin: 'ZEC', tx: null, actor: 'parallaxpay', mine: true },
      { id: 1, at: now - 54 * 3600, kind: 'exit', text: 'NEAR touched its stop. Out with a small loss, as planned.', coin: 'NEAR', tx: null, actor: 'parallaxpay', mine: true },
    ],
  }
}
