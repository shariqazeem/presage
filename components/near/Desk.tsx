'use client'

import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { ActionButton, Eyebrow, Panel, PanelHead } from '../kit'
import { cx } from '../ui'
import { COINS, USDC, USDC_ID, coinById, tokenById } from '@/lib/near/config'
import type { CoinRead, Desk as DeskData } from '@/lib/near/hooks'
import { quoteBuy, quoteSell } from '@/lib/near/rhea'
import type { PositionView } from '@/lib/near/store'
import { setRulesTx, stopTx, tradeTx } from '@/lib/near/tx'
import { fromUnits, lessBps } from '@/lib/near/units'
import type { Member } from '@/lib/near/vault'
import { PositionCard, money, qty } from './kit'
import { Floor } from './agent'
import { Terminal } from './Terminal'
import type { AgentState } from '@/lib/near/hooks'
import { useNear } from './NearWallet'
import { rulesSummary } from './RulesForm'
import { FundSheet, RulesSheet, WithdrawSheet, sayError, tellAgent } from './sheets'

const SLIPPAGE_BPS = 80

function Balances({ member, prices }: { member: Member; prices: Record<string, number> }) {
  const rows = [USDC_ID, ...COINS.map(c => c.id)]
    .map(id => {
      const t = tokenById(id)!
      const amount = fromUnits(member.balances[id] ?? '0', t.decimals)
      const usd = id === USDC_ID ? amount : amount * (prices[id] ?? 0)
      return { id, symbol: t.symbol, amount, usd }
    })
    .filter(r => r.amount > 0 || r.id === USDC_ID)
  const total = rows.reduce((s, r) => s + r.usd, 0)
  return (
    <div>
      <div className="label !text-[10px] text-[#8A8A92]">Your ParallaxPay account</div>
      <div className="num text-[40px] md:text-[48px] font-semibold text-white leading-none mt-2">{money(total)}</div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {rows.map(r => (
          <div key={r.id} className="rounded-[12px] bg-white/[0.06] px-3 py-2.5">
            <div className="label !text-[9.5px] text-[#8A8A92]">{r.symbol}</div>
            <div className="num text-[15px] text-white mt-1">{r.id === USDC_ID ? money(r.amount) : qty(r.amount)}</div>
            {r.id !== USDC_ID && <div className="num text-[11.5px] text-[#8A8A92]">{money(r.usd)}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Desk({ data, agent, refresh }: { data: DeskData; agent: AgentState | undefined; refresh: () => void }) {
  const reads: CoinRead[] = agent?.reads ?? []
  const { accountId, send } = useNear()
  const qc = useQueryClient()
  const member = data.member!
  const [sheet, setSheet] = useState<'fund' | 'withdraw' | 'rules' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const prices: Record<string, number> = Object.fromEntries(reads.map(r => [r.token, r.price]))
  const proposals = data.positions.filter(p => p.status === 'proposed' && p.mode === 'ask')
  const open = data.positions.filter(p => p.status === 'open')
  const past = data.positions.filter(p => p.status === 'closed' || p.status === 'not_filled' || p.status === 'declined')
  const usdc = BigInt(member.balances[USDC_ID] ?? '0')
  const after = async () => {
    if (accountId) await tellAgent(accountId)
    refresh()
    qc.invalidateQueries({ queryKey: ['near-agent'] })
  }

  const toggle = async () => {
    if (!accountId) return
    setBusy('toggle')
    try {
      if (member.rules.autopilot) {
        await send([stopTx()])
        toast.success('Autopilot is off. The agent will ask before every trade.')
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
    const coin = coinById(p.token)
    if (!accountId || !coin || p.callId == null) return
    const amountIn = BigInt(p.usdcInRaw)
    if (usdc < amountIn) return toast.error(`This trade needs ${money(fromUnits(amountIn, USDC.decimals))} USDC in your account. Add funds first.`)
    setBusy(`approve-${p.id}`)
    try {
      const minOut = lessBps(await quoteBuy(coin, amountIn), SLIPPAGE_BPS)
      const [hash] = await send([tradeTx({ accountId, tokenIn: USDC_ID, tokenOut: coin.id, amountIn, minOut, call: p.callId })])
      if (!hash) throw new Error('The wallet did not return the transaction.')
      const r = await fetch(`/api/near/positions/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: hash, action: 'approve' }) })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error ?? 'Could not record the trade')
      toast.success(`Bought ${coin.symbol}. The agent will tell you when it's time to sell.`)
      await after()
    } catch (e) {
      sayError(e)
    }
    setBusy(null)
  }

  const sell = async (p: PositionView) => {
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

  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 lg:px-8 pt-5 md:pt-8 pb-10">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4 md:gap-5">
        <Panel tone="ticket" className="p-5 md:p-6">
          <Balances member={member} prices={prices} />
          <div className="mt-5 flex items-center justify-between gap-3 rounded-[14px] bg-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cx('w-2.5 h-2.5 rounded-full shrink-0', member.rules.autopilot ? 'bg-up-d animate-[soft-pulse_2s_ease-in-out_infinite]' : 'bg-[#8A8A92]')} />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-white">{member.rules.autopilot ? 'Autopilot is on' : 'Asks you first'}</div>
                <div className="text-[12px] text-[#8A8A92] truncate">
                  {member.buys_today}/{member.rules.trades_per_day} buys today · up to {money(fromUnits(member.rules.max_trade, USDC.decimals))} each
                </div>
              </div>
            </div>
            <button onClick={toggle} disabled={busy === 'toggle'} className={cx('h-9 px-4 rounded-full text-[13px] font-semibold shrink-0 disabled:opacity-50', member.rules.autopilot ? 'bg-down text-white' : 'bg-white text-ink')}>
              {busy === 'toggle' ? '…' : member.rules.autopilot ? 'Stop' : 'Turn on'}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={() => setSheet('fund')} className="h-11 rounded-[12px] bg-white text-ink text-[14px] font-semibold">Add funds</button>
            <button onClick={() => setSheet('withdraw')} className="h-11 rounded-[12px] bg-white/10 text-white text-[14px] font-semibold">Withdraw</button>
            <button onClick={() => setSheet('rules')} className="h-11 rounded-[12px] bg-white/10 text-white text-[14px] font-semibold">Rules</button>
          </div>
          <p className="mt-3 text-[12px] text-[#8A8A92] leading-snug">{rulesSummary(member.rules)}</p>
        </Panel>

        <Terminal agent={agent} compact />
      </div>

      {proposals.length > 0 && (
        <section className="mt-6">
          <PanelHead title="Waiting for you" sub="The agent sealed these plans on NEAR. Approve to trade from your account." />
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {proposals.map(p => (
              <PositionCard
                key={p.id}
                p={p}
                action={
                  <div>
                    {p.plan && (
                      <p className="text-[13.5px] text-ink-2 leading-snug mb-3">
                        Buy {money(p.usdcIn)} of {p.coin} near {money(p.plan.entry.priceAtIssue)}. Stop {money(p.plan.stop)}, target {money(p.plan.target)}. {p.plan.why[0]}
                      </p>
                    )}
                    <ActionButton onClick={() => approve(p)} disabled={busy != null}>
                      {busy === `approve-${p.id}` ? 'Confirm in your wallet…' : `Approve ${money(p.usdcIn)}`}
                    </ActionButton>
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <PanelHead title="Open trades" sub={open.length ? 'Live value at the agent’s latest price.' : undefined} />
        {open.length ? (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {open.map(p => (
              <PositionCard
                key={p.id}
                p={p}
                price={prices[p.token]}
                action={
                  p.exitProposed || !member.rules.autopilot ? (
                    <div>
                      {p.exitProposed && <p className="text-[13.5px] text-ink-2 mb-3">Time to sell: {p.exitReason}.</p>}
                      <ActionButton tone={p.exitProposed ? 'black' : 'white'} onClick={() => sell(p)} disabled={busy != null}>
                        {busy === `sell-${p.id}` ? 'Confirm in your wallet…' : `Sell ${p.coin} now`}
                      </ActionButton>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <Panel tone="soft" className="mt-3 p-5 text-[14px] text-ink-2">
            Nothing open. {member.rules.autopilot ? 'The agent buys when a setup meets your rules.' : 'When a setup meets your rules, it will show up above for you to approve.'}
            {usdc === 0n && ' Add USDC so it has something to work with.'}
          </Panel>
        )}
      </section>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-5 mt-6">
        <Panel className="p-5">
          <PanelHead title="Your floor" sub="What ParallaxPay did for you, and what it’s seeing." right={<Eyebrow>Live</Eyebrow>} />
          <div className="mt-2">
            <Floor lines={data.feed} />
          </div>
        </Panel>
        <Panel className="p-5">
          <PanelHead title="Your past trades" right={<Link href="/record" className="text-[13px] underline decoration-line underline-offset-2">Everyone’s</Link>} />
          <div className="grid gap-3 mt-3">
            {past.length ? past.slice(0, 8).map(p => <PositionCard key={p.id} p={p} />) : <p className="text-[14px] text-ink-3 py-4">None yet.</p>}
          </div>
        </Panel>
      </div>

      <FundSheet open={sheet === 'fund'} onClose={() => setSheet(null)} onDone={refresh} />
      <WithdrawSheet open={sheet === 'withdraw'} onClose={() => setSheet(null)} member={member} onDone={refresh} />
      <RulesSheet open={sheet === 'rules'} onClose={() => setSheet(null)} current={member.rules} onDone={refresh} />
    </div>
  )
}
