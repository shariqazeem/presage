'use client'

import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { IconChevron, IconLive, IconPencil, IconPlus, IconRefund, IconX } from '../icons'
import { Ring, Sheet } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { COINS, USDC, USDC_ID, coinById, tokenById } from '@/lib/near/config'
import type { AgentState, Desk as DeskData } from '@/lib/near/hooks'
import { quoteBuy, quoteSell } from '@/lib/near/rhea'
import type { PositionView } from '@/lib/near/store'
import { setRulesTx, stopTx, tradeTx } from '@/lib/near/tx'
import { fromUnits, lessBps } from '@/lib/near/units'
import type { Member } from '@/lib/near/vault'
import { Floor } from './agent'
import { money, pctText, qty, usd } from './kit'
import { RollingNumber } from './motion'
import { useNear } from './NearWallet'
import { Chip, IconAction, Switch } from './primitives'
import { rulesSummary } from './RulesForm'
import { FundSheet, RulesSheet, WithdrawSheet, sayError, tellAgent } from './sheets'

const SLIPPAGE_BPS = 80

function holdings(member: Member, prices: Record<string, number>) {
  return [USDC_ID, ...COINS.map(c => c.id)]
    .map(id => {
      const t = tokenById(id)!
      const amount = fromUnits(member.balances[id] ?? '0', t.decimals)
      return { id, symbol: t.symbol, amount, usd: id === USDC_ID ? amount : amount * (prices[id] ?? 0) }
    })
    .filter(r => r.amount > 0 || r.id === USDC_ID)
}

/** Where price sits between the stop and the target, as an exchange shows a position's range. */
function Range({ stop, target, entry, now }: { stop: number; target: number; entry: number | null; now: number | null }) {
  if (!stop || !target || target <= stop) return null
  const at = (p: number) => `${Math.min(100, Math.max(0, ((p - stop) / (target - stop)) * 100))}%`
  return (
    <div className="w-full">
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/30 via-paper-2 to-up/35">
        {entry != null && <span className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3.5 bg-ink-3 rounded-full" style={{ left: at(entry) }} />}
        {now != null && <span className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-ink ring-2 ring-white" style={{ left: `calc(${at(now)} - 6px)` }} />}
      </div>
      <div className="flex justify-between mt-1 num text-[11px] text-ink-3">
        <span>stop {money(stop)}</span>
        <span>target {money(target)}</span>
      </div>
    </div>
  )
}

function PositionRow({ p, price, action }: { p: PositionView; price: number | null; action?: React.ReactNode }) {
  const pnl = price != null && p.coinAmount != null ? p.coinAmount * price - p.usdcIn : null
  const pnlPct = pnl != null && p.usdcIn > 0 ? pnl / p.usdcIn : null
  return (
    <div className="rounded-[20px] border border-line p-4">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-ink text-white grid place-items-center font-heading font-black text-[12px] shrink-0">{p.coin.slice(0, 4)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px]">{p.coin}</span>
            <Chip tone={p.mode === 'ask' ? 'muted' : 'strong'}>{p.mode === 'ask' ? 'Approved' : 'Autopilot'}</Chip>
          </div>
          <div className="text-[12.5px] text-ink-3 num mt-0.5 truncate">
            {qty(p.coinAmount)} · in {money(p.entryPrice)} · now {price != null ? money(price) : '—'}
          </div>
        </div>
        <div className="text-right">
          <div className={cx('num text-[16px] font-semibold', pnl == null ? 'text-ink-3' : pnl >= 0 ? 'text-up' : 'text-down')}>{usd(pnl, { sign: true })}</div>
          <div className={cx('num text-[12px]', pnl == null ? 'text-ink-3' : pnl >= 0 ? 'text-up' : 'text-down')}>{pctText(pnlPct)}</div>
        </div>
      </div>
      <div className="mt-3">
        <Range stop={p.stop} target={p.target} entry={p.entryPrice} now={price} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12.5px]">
        <span className="text-ink-3">{p.callId != null ? `Plan #${p.callId} ${p.opened ? 'opened' : 'sealed'}` : ''}</span>
        <Link href={`/record/${p.id}`} className="font-semibold flex items-center gap-0.5">
          Receipt <IconChevron size={13} />
        </Link>
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Desk({ data, agent, refresh, preview = false }: { data: DeskData; agent: AgentState | undefined; refresh: () => void; preview?: boolean }) {
  const reads = agent?.reads ?? []
  const { accountId, send } = useNear()
  const qc = useQueryClient()
  const member = data.member!
  const [sheet, setSheet] = useState<'fund' | 'withdraw' | 'rules' | null>(null)
  const [shot, setShot] = useState<PositionView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const prices: Record<string, number> = Object.fromEntries(reads.map(r => [r.token, r.price]))
  const rows = holdings(member, prices)
  const total = rows.reduce((s, r) => s + r.usd, 0)
  const proposals = data.positions.filter(p => p.status === 'proposed' && p.mode === 'ask')
  const open = data.positions.filter(p => p.status === 'open')
  const past = data.positions.filter(p => p.status === 'closed' || p.status === 'not_filled' || p.status === 'declined')
  const usdc = BigInt(member.balances[USDC_ID] ?? '0')
  const openPnl = open.reduce((s, p) => s + (prices[p.token] != null && p.coinAmount != null ? p.coinAmount * prices[p.token] - p.usdcIn : 0), 0)
  const guard = () => {
    if (preview) toast('This is a preview with sample data.')
    return preview
  }
  const after = async () => {
    if (accountId) await tellAgent(accountId)
    refresh()
    qc.invalidateQueries({ queryKey: ['near-agent'] })
  }

  const toggle = async () => {
    if (guard() || !accountId) return
    setBusy('toggle')
    try {
      if (member.rules.autopilot) {
        await send([stopTx()])
        toast.success('Autopilot is off. ParallaxPay will ask before every trade.')
      } else {
        if (!member.rules.coins.length) throw new Error('Pick at least one coin in your rules first.')
        await send([setRulesTx({ ...member.rules, autopilot: true })])
        toast.success('Autopilot is on, inside your limits.')
      }
      await after()
    } catch (e) {
      sayError(e)
    }
    setBusy(null)
  }

  const approve = async (p: PositionView) => {
    if (guard()) return
    const coin = coinById(p.token)
    if (!accountId || !coin || p.callId == null) return
    const amountIn = BigInt(p.usdcInRaw)
    if (usdc < amountIn) return toast.error(`This trade needs ${usd(fromUnits(amountIn, USDC.decimals))} USDC in your account. Add funds first.`)
    setBusy(`approve-${p.id}`)
    try {
      const minOut = lessBps(await quoteBuy(coin, amountIn), SLIPPAGE_BPS)
      const [hash] = await send([tradeTx({ accountId, tokenIn: USDC_ID, tokenOut: coin.id, amountIn, minOut, call: p.callId })])
      if (!hash) throw new Error('The wallet did not return the transaction.')
      const r = await fetch(`/api/near/positions/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: hash, action: 'approve' }) })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error ?? 'Could not record the trade')
      toast.success(`Bought ${coin.symbol}. ParallaxPay will tell you when it's time to sell.`)
      await after()
    } catch (e) {
      sayError(e)
    }
    setBusy(null)
  }

  const sell = async (p: PositionView) => {
    if (guard()) return
    const coin = coinById(p.token)
    if (!accountId || !coin) return
    const held = BigInt(member.balances[coin.id] ?? '0')
    const want = BigInt(p.coinAmountRaw ?? '0')
    const amountIn = held < want ? held : want
    if (amountIn === 0n) return toast.error(`There's no ${coin.symbol} left in your account for this trade.`)
    setBusy(`sell-${p.id}`)
    try {
      const minOut = lessBps(await quoteSell(coin, amountIn), SLIPPAGE_BPS)
      const [hash] = await send([tradeTx({ accountId, tokenIn: coin.id, tokenOut: USDC_ID, amountIn, minOut, call: p.callId })])
      if (!hash) throw new Error('The wallet did not return the transaction.')
      const r = await fetch(`/api/near/positions/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: hash, action: 'sell' }) })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error ?? 'Could not record the sale')
      toast.success(`Sold ${coin.symbol} back to USDC.`)
      await after()
    } catch (e) {
      sayError(e)
    }
    setBusy(null)
  }

  const used = member.buys_today
  const allowed = member.rules.trades_per_day

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-8 pb-28 md:pb-12">
      {preview && <div className="mb-4 rounded-[14px] bg-paper-2 px-4 py-2.5 text-[13px] text-ink-2">Preview with sample data. Nothing here is real.</div>}
      <section className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4">
        <div className="rounded-[24px] bg-ink text-white p-5 md:p-6 relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
          <div className="text-[13px] text-[#A1A1AA]">Your account</div>
          <RollingNumber value={usd(total)} className="text-[44px] md:text-[54px] font-semibold mt-2 tracking-[-0.02em]" />
          <div className={cx('num text-[14px] mt-2', openPnl > 0 ? 'text-up-d' : openPnl < 0 ? 'text-down-d' : 'text-[#A1A1AA]')}>{open.length ? `${usd(openPnl, { sign: true })} on ${open.length} open trade${open.length === 1 ? '' : 's'}` : 'Nothing open right now'}</div>
          <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
            {rows.map(r => (
              <span key={r.id} className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1.5 text-[13px]">
                <b className="font-semibold">{r.symbol}</b> <span className="num text-[#C9C9CF]">{r.id === USDC_ID ? usd(r.amount) : `${qty(r.amount)} · ${usd(r.usd)}`}</span>
              </span>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-4 gap-2 max-w-[400px]">
            <IconAction tone="night" icon={<IconPlus size={20} />} label="Add" onClick={() => setSheet('fund')} />
            <IconAction tone="night" icon={<IconRefund size={20} />} label="Withdraw" onClick={() => setSheet('withdraw')} />
            <IconAction tone="night" icon={<IconPencil size={18} />} label="Rules" onClick={() => setSheet('rules')} />
            {member.rules.autopilot ? <IconAction tone="danger" icon={<IconX size={18} />} label="Stop" onClick={toggle} /> : <IconAction tone="night" icon={<IconLive size={18} />} label="Autopilot" onClick={toggle} />}
          </div>
        </div>

        <div className="rounded-[24px] border border-line p-5 md:p-6 flex flex-col">
          <div className="flex items-center gap-3">
            <Mark size={40} />
            <div className="min-w-0">
              <div className="font-semibold text-[15.5px]">{member.rules.autopilot ? 'ParallaxPay is trading for you' : 'ParallaxPay asks before it trades'}</div>
              <div className="text-[13px] text-ink-3 truncate">{rulesSummary(member.rules)}</div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-[18px] bg-paper-2 px-4 py-3">
            <div>
              <div className="font-semibold text-[15px]">Autopilot</div>
              <div className="text-[13px] text-ink-3">{member.rules.autopilot ? 'Trades inside your limits' : 'Off: it proposes, you approve'}</div>
            </div>
            <Switch on={member.rules.autopilot} onChange={toggle} disabled={busy === 'toggle'} label="Autopilot" />
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-[18px] bg-paper-2 px-4 py-3">
            <Ring progress={allowed ? used / allowed : 0} size={44} stroke={4} dark={false} label={`${used}/${allowed}`} />
            <div>
              <div className="font-semibold text-[15px]">Buys today</div>
              <div className="text-[13px] text-ink-3">up to {usd(fromUnits(member.rules.max_trade, USDC.decimals), { trim: true })} each, resets at midnight UTC</div>
            </div>
          </div>
          <Link href="/" className="mt-auto pt-4 text-[13.5px] font-semibold flex items-center gap-1">
            See what it’s watching <IconChevron size={14} />
          </Link>
        </div>
      </section>

      {proposals.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-[22px] font-black tight">Waiting for you</h2>
            <span className="w-2 h-2 rounded-full foil" />
          </div>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {proposals.map(p => (
              <div key={p.id} className="rounded-[22px] bg-ink text-white p-4 relative overflow-hidden">
                <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
                <div className="flex items-start gap-3">
                  <Mark size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15px]">
                      Buy {usd(p.usdcIn, { trim: true })} of {p.coin}?
                    </div>
                    {p.plan && (
                      <p className="text-[13.5px] text-[#C9C9CF] leading-snug mt-1">
                        Near {money(p.plan.entry.priceAtIssue)}, stop {money(p.plan.stop)}, target {money(p.plan.target)}. {p.plan.why[0]}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button onClick={() => approve(p)} disabled={busy != null} className="h-12 rounded-[14px] bg-white text-ink font-semibold press disabled:opacity-50">
                    {busy === `approve-${p.id}` ? 'Confirm in your wallet…' : `Approve ${usd(p.usdcIn, { trim: true })}`}
                  </button>
                  <button onClick={() => setShot(p)} className="h-12 px-4 rounded-[14px] bg-white/10 text-white text-[14px] font-semibold press">
                    The chart
                  </button>
                </div>
                <div className="text-[12px] text-[#8A8A92] mt-2">Plan #{p.callId} sealed on NEAR · open for 30 minutes</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-heading text-[22px] font-black tight">Open trades</h2>
        {open.length ? (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {open.map(p => (
              <PositionRow
                key={p.id}
                p={p}
                price={prices[p.token] ?? null}
                action={
                  p.exitProposed || !member.rules.autopilot ? (
                    <button onClick={() => sell(p)} disabled={busy != null} className={cx('w-full h-11 rounded-[14px] font-semibold press disabled:opacity-50', p.exitProposed ? 'bg-ink text-white' : 'bg-paper-2 text-ink')}>
                      {busy === `sell-${p.id}` ? 'Confirm in your wallet…' : p.exitProposed ? `Sell now: ${p.exitReason}` : `Sell ${p.coin} now`}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[20px] bg-paper-2 p-5 text-[14px] text-ink-2 leading-snug">
            Nothing open. {member.rules.autopilot ? 'ParallaxPay buys when a setup fits your rules.' : 'When a setup fits your rules, it shows up here for you to approve.'}
            {usdc === 0n && (
              <button onClick={() => setSheet('fund')} className="block mt-2 font-semibold text-ink underline decoration-line underline-offset-2">
                Add USDC so it has something to work with
              </button>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 grid lg:grid-cols-2 gap-4">
        <div className="rounded-[22px] border border-line p-4 md:p-5">
          <h2 className="font-heading text-[18px] font-black tight">Activity</h2>
          <Floor lines={data.feed} max={10} showMine={false} />
        </div>
        <div className="rounded-[22px] border border-line p-4 md:p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-[18px] font-black tight">History</h2>
            <Link href="/record" className="text-[13px] font-semibold text-ink-3">
              Everyone’s
            </Link>
          </div>
          {past.length ? (
            <ol className="mt-2 divide-y divide-line">
              {past.slice(0, 8).map(p => (
                <li key={p.id}>
                  <Link href={`/record/${p.id}`} className="flex items-center gap-3 py-3 press">
                    <span className="font-semibold text-[14px] w-16">{p.coin}</span>
                    <span className="flex-1 text-[13px] text-ink-3 truncate">{p.status === 'closed' ? p.exitReason : p.status === 'not_filled' ? 'didn’t fill' : 'not taken'}</span>
                    <span className={cx('num text-[14px] font-semibold', p.pnlUsd == null ? 'text-ink-3' : p.pnlUsd >= 0 ? 'text-up' : 'text-down')}>{p.pnlUsd == null ? '—' : usd(p.pnlUsd, { sign: true })}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[14px] text-ink-3 py-4">No finished trades yet.</p>
          )}
        </div>
      </section>

      <Sheet open={shot != null} onClose={() => setShot(null)} title={shot ? `What ParallaxPay read on ${shot.coin}` : ''}>
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/near/chart/pos-${shot.id}`} alt={`The ${shot.coin} chart behind this plan`} className="w-full rounded-[14px] border border-line" />
        )}
      </Sheet>
      <FundSheet open={sheet === 'fund'} onClose={() => setSheet(null)} onDone={refresh} />
      <WithdrawSheet open={sheet === 'withdraw'} onClose={() => setSheet(null)} member={member} onDone={refresh} />
      <RulesSheet open={sheet === 'rules'} onClose={() => setSheet(null)} current={member.rules} onDone={refresh} />
    </div>
  )
}
