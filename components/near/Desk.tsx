'use client'

import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { IconChevron } from '../icons'
import { Ring, Sheet, useNow } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { COINS, USDC, USDC_ID, coinById, tokenById } from '@/lib/near/config'
import { px } from '@/lib/near/drawing'
import type { AgentState, CoinRead, Desk as DeskData } from '@/lib/near/hooks'
import { quoteBuy, quoteSell } from '@/lib/near/rhea'
import type { PositionView } from '@/lib/near/store'
import { setRulesTx, stopTx, tradeTx } from '@/lib/near/tx'
import { fromUnits, lessBps } from '@/lib/near/units'
import type { Member } from '@/lib/near/vault'
import { Floor } from './agent'
import { AgentDrawing } from './AgentDrawing'
import { Ask } from './Ask'
import { pctText, qty, usd } from './kit'
import { MandateCard } from './Mandate'
import { RollingNumber } from './motion'
import { useNear } from './NearWallet'
import { Switch } from './primitives'
import { Ticket } from './Promises'
import { FundSheet, RulesSheet, WithdrawSheet, sayError, tellAgent } from './sheets'
import { focusOf, statusOf, voice } from './Stage'

/**
 * Your agent: ParallaxPay working for one person. What it wants your answer on, the trades it is
 * running for you (drawn on its charts with their plans), what it is watching for you, the mandate
 * you signed, and a place to talk to it. The account sits in the header, not at the centre.
 */

const SLIPPAGE_BPS = 80
const READ_EVERY = 15 * 60

function holdings(member: Member, prices: Record<string, number>) {
  return [USDC_ID, ...COINS.map(c => c.id)]
    .map(id => {
      const t = tokenById(id)!
      const amount = fromUnits(member.balances[id] ?? '0', t.decimals)
      return { id, symbol: t.symbol, amount, usd: id === USDC_ID ? amount : amount * (prices[id] ?? 0) }
    })
    .filter(r => r.amount > 0 || r.id === USDC_ID)
}

function Heartbeat({ at }: { at: number | undefined }) {
  const now = useNow(1000)
  if (!at) return null
  const left = Math.max(0, at - now)
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <Ring progress={left === 0 ? 1 : 1 - left / READ_EVERY} size={32} stroke={3} label="" />
      <div className="leading-tight">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">{left === 0 ? 'Reading' : 'Next read'}</div>
        <div className="num text-[14px] text-white">{left === 0 ? 'now…' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</div>
      </div>
    </div>
  )
}

function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{eyebrow}</div>
        <h2 className="font-heading text-[22px] font-black tight mt-0.5">{title}</h2>
      </div>
      {right}
    </div>
  )
}

/** A trade it is running for you, on its chart: where it bought, where it gets out either way. */
function Mission({ p, price, action }: { p: PositionView; price: number | null; action?: React.ReactNode }) {
  const pnl = price != null && p.coinAmount != null ? p.coinAmount * price - p.usdcIn : null
  const pnlPct = pnl != null && p.usdcIn > 0 ? pnl / p.usdcIn : null
  return (
    <div className="rounded-[22px] bg-ink text-white overflow-hidden relative">
      <div className="flex items-start gap-3 px-4 pt-4">
        <Mark size={30} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight">
            {p.coin} · {p.mode === 'ask' ? 'you approved' : 'autopilot'}
          </div>
          <div className="num text-[12.5px] text-[#8A8A92] mt-0.5 truncate">
            {qty(p.coinAmount)} {p.coin} · in at {p.entryPrice != null ? px(p.entryPrice) : '—'}
          </div>
        </div>
        <div className="text-right">
          <div className={cx('num text-[18px] font-semibold', pnl == null ? 'text-[#8A8A92]' : pnl >= 0 ? 'text-up-d' : 'text-down-d')}>{usd(pnl, { sign: true })}</div>
          <div className={cx('num text-[12px]', pnl == null ? 'text-[#8A8A92]' : pnl >= 0 ? 'text-up-d' : 'text-down-d')}>{pctText(pnlPct)}</div>
        </div>
      </div>
      <div className="px-2 pt-2">
        <AgentDrawing
          coin={p.coin}
          tf="1h"
          size="card"
          plan={{ entry: p.entryPrice, stop: p.stop || null, target: p.target || null, from: p.openedAt }}
          markers={p.openedAt && p.entryPrice ? [{ at: p.openedAt, price: p.entryPrice, label: 'In', tone: 'in' }] : []}
          className="aspect-[16/9]"
          label={`ParallaxPay's ${p.coin} chart with this trade's stop and target`}
        />
      </div>
      <div className="px-4 pb-4 pt-1 flex items-center justify-between text-[12.5px]">
        <span className="text-[#8A8A92]">{p.callId != null ? `Plan #${p.callId} ${p.opened ? 'opened' : 'sealed'} on NEAR` : ''}</span>
        <Link href={`/record/${p.id}`} className="font-semibold text-[#C9C9CF] hover:text-white flex items-center gap-0.5">
          Receipt <IconChevron size={13} />
        </Link>
      </div>
      {action && <div className="px-4 pb-4">{action}</div>}
    </div>
  )
}

/** A coin it is watching for you: its drawing and what it says about it. */
function Watch({ r }: { r: CoinRead }) {
  const s = statusOf(r)
  return (
    <Link href={`/?coin=${r.coin}#live`} className="rounded-[20px] bg-ink text-white overflow-hidden press block">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <span className="font-heading text-[16px] font-black tight">{r.coin}</span>
        <span className="flex items-center gap-2">
          <span className="num text-[13px] text-[#C9C9CF]">{px(r.price)}</span>
          <span className={cx('rounded-full px-2 h-[20px] inline-flex items-center text-[10.5px] font-semibold uppercase tracking-[0.07em]', s.tone === 'live' ? 'foil text-white' : s.tone === 'close' ? 'bg-white text-ink' : 'bg-white/[0.08] text-[#A1A1AA]')}>{s.word}</span>
        </span>
      </div>
      <div className="px-1.5 pt-1">
        <AgentDrawing coin={r.coin} tf="1h" size="card" focus={focusOf(r)} className="aspect-[16/8]" label={`ParallaxPay's drawing of ${r.coin}`} />
      </div>
      <p className="px-4 pb-4 pt-1 text-[13px] text-[#C9C9CF] leading-snug line-clamp-3">{voice(r)}</p>
    </Link>
  )
}

export function Desk({ data, agent, refresh, preview = false }: { data: DeskData; agent: AgentState | undefined; refresh: () => void; preview?: boolean }) {
  const reads = agent?.reads ?? []
  const { accountId, send } = useNear()
  const qc = useQueryClient()
  const member = data.member!
  const now = useNow(30_000)
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
  const mine = reads.filter(r => member.rules.coins.includes(r.token))
  const watching = mine.map(r => r.coin).join(' and ')
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
        if (!member.rules.coins.length) throw new Error('Pick at least one coin in your mandate first.')
        await send([setRulesTx({ ...member.rules, autopilot: true })])
        toast.success('Autopilot is on, inside your mandate.')
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
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-7 pb-28 md:pb-12">
      {preview && <div className="mb-4 rounded-[14px] bg-paper-2 px-4 py-2.5 text-[13px] text-ink-2">Preview with sample data. Nothing here is real.</div>}

      {/* your agent and your account */}
      <section className="rounded-[28px] bg-ink text-white relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="flex items-center gap-3 px-4 md:px-6 pt-4 md:pt-5">
          <div className="relative shrink-0">
            <span className="absolute -inset-1 rounded-[14px] foil opacity-40 blur-[6px] animate-[soft-pulse_2.4s_ease-in-out_infinite]" />
            <span className="relative block">
              <Mark size={40} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-tight">Your ParallaxPay</div>
            <div className="text-[12.5px] text-[#A1A1AA] mt-0.5 truncate">
              Watching {watching || 'your coins'} for you · {member.rules.autopilot ? 'autopilot' : 'asks first'}
            </div>
          </div>
          <Heartbeat at={agent?.nextCheckAt} />
        </div>
        <div className="px-4 md:px-6 pt-5 pb-5 flex flex-col md:flex-row md:items-end gap-4 md:gap-8">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-[#8A8A92]">In your account</div>
            <RollingNumber value={usd(total)} className="text-[40px] md:text-[48px] font-semibold mt-1.5 tracking-[-0.02em]" />
            <div className={cx('num text-[13.5px] mt-2', openPnl > 0 ? 'text-up-d' : openPnl < 0 ? 'text-down-d' : 'text-[#8A8A92]')}>{open.length ? `${usd(openPnl, { sign: true })} on ${open.length} open trade${open.length === 1 ? '' : 's'}` : 'Nothing open right now'}</div>
            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
              {rows.map(r => (
                <span key={r.id} className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12.5px]">
                  <b className="font-semibold">{r.symbol}</b> <span className="num text-[#C9C9CF]">{r.id === USDC_ID ? usd(r.amount) : `${qty(r.amount)} · ${usd(r.usd)}`}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:w-[280px] shrink-0">
            <button onClick={() => setSheet('fund')} className="h-11 rounded-full bg-white text-ink text-[14px] font-semibold press">
              Add USDC
            </button>
            <button onClick={() => setSheet('withdraw')} className="h-11 rounded-full bg-white/10 text-white text-[14px] font-semibold press">
              Withdraw
            </button>
          </div>
        </div>
      </section>

      <div className="mt-5 grid lg:grid-cols-[minmax(0,1fr)_370px] gap-5 items-start">
        <div className="grid gap-6 min-w-0">
          {proposals.length > 0 && (
            <section>
              <SectionTitle eyebrow="Needs you" title={`It wants your answer${proposals.length > 1 ? ` on ${proposals.length} trades` : ''}`} right={<span className="w-2.5 h-2.5 rounded-full foil mb-2" />} />
              <div className="grid gap-3 mt-3">
                {proposals.map(p => (
                  <div key={p.id} className="rounded-[22px] bg-ink text-white overflow-hidden relative">
                    <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
                    <div className="flex items-start gap-3 px-4 pt-4">
                      <Mark size={32} className="shrink-0" />
                      <div className="rounded-[16px] rounded-tl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-[14.5px] leading-snug text-[#F4F4F2]">
                        I&rsquo;d buy {usd(p.usdcIn, { trim: true })} of {p.coin}
                        {p.plan ? ` near ${px(p.plan.entry.priceAtIssue)}. If it's wrong I'm out at ${px(p.plan.stop)}; I'm aiming for ${px(p.plan.target)}.` : '.'} {p.plan?.why[0]}
                      </div>
                    </div>
                    <div className="px-2 pt-2">
                      <AgentDrawing
                        coin={p.coin}
                        tf="1h"
                        size="card"
                        plan={p.plan ? { entry: p.plan.entry.priceAtIssue, stop: p.plan.stop, target: p.plan.target, from: p.plan.issuedAt } : { stop: p.stop, target: p.target }}
                        className="aspect-[16/9]"
                        label={`The ${p.coin} plan ParallaxPay sealed, on its chart`}
                      />
                    </div>
                    <div className="px-4 pb-4 pt-2 grid grid-cols-[1fr_auto] gap-2">
                      <button onClick={() => approve(p)} disabled={busy != null} className="h-12 rounded-[14px] bg-white text-ink font-semibold press disabled:opacity-50">
                        {busy === `approve-${p.id}` ? 'Confirm in your wallet…' : `Approve ${usd(p.usdcIn, { trim: true })}`}
                      </button>
                      <button onClick={() => setShot(p)} className="h-12 px-4 rounded-[14px] bg-white/10 text-white text-[14px] font-semibold press">
                        Exact chart
                      </button>
                    </div>
                    <div className="px-4 pb-4 -mt-2 text-[12px] text-[#8A8A92]">Plan #{p.callId} is sealed on NEAR. It stays open for 30 minutes.</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle eyebrow="Working on" title={open.length ? `${open.length} trade${open.length === 1 ? '' : 's'} for you` : 'No trades open'} />
            {open.length ? (
              <div className={cx('grid gap-3 mt-3', open.length > 1 && 'md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2')}>
                {open.map(p => (
                  <Mission
                    key={p.id}
                    p={p}
                    price={prices[p.token] ?? null}
                    action={
                      p.exitProposed || !member.rules.autopilot ? (
                        <button onClick={() => sell(p)} disabled={busy != null} className={cx('w-full h-11 rounded-[14px] font-semibold press disabled:opacity-50', p.exitProposed ? 'bg-white text-ink' : 'bg-white/10 text-white')}>
                          {busy === `sell-${p.id}` ? 'Confirm in your wallet…' : p.exitProposed ? `Sell now: ${p.exitReason}` : `Sell ${p.coin} now`}
                        </button>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-[20px] bg-paper-2 p-4 text-[14px] text-ink-2 leading-snug">
                {member.rules.autopilot ? 'When a setup fits your mandate, it buys and the trade shows up here with its stop and target.' : 'When a setup fits your mandate, it asks you here first, with the chart and the plan it sealed.'}
                {usdc === 0n && (
                  <button onClick={() => setSheet('fund')} className="block mt-2 font-semibold text-ink underline decoration-line underline-offset-2">
                    Add USDC so it has something to work with
                  </button>
                )}
              </div>
            )}
          </section>

          {mine.length > 0 && (
            <section>
              <SectionTitle eyebrow="Watching for you" title={`What it sees on ${watching}`} />
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {mine.map(r => (
                  <Watch key={r.coin} r={r} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="grid gap-4 min-w-0 lg:sticky lg:top-[120px]">
          <MandateCard rules={member.rules} state="signed" signer={accountId ?? (preview ? 'you.near' : null)} compact>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[14.5px] font-semibold">Autopilot</div>
                  <div className="text-[12.5px] text-ink-3">{member.rules.autopilot ? 'It trades on its own, inside this mandate' : 'Off: it asks you before every trade'}</div>
                </div>
                <Switch on={member.rules.autopilot} onChange={toggle} disabled={busy === 'toggle'} label="Autopilot" />
              </div>
              <div className="flex items-center gap-3">
                <Ring progress={allowed ? used / allowed : 0} size={40} stroke={4} dark={false} label={`${used}/${allowed}`} />
                <div className="min-w-0 flex-1 text-[12.5px] text-ink-3 leading-snug">
                  {used} of {allowed} buys used today. Resets at midnight UTC.
                </div>
                <button onClick={() => setSheet('rules')} className="h-9 px-3.5 rounded-full bg-paper-2 text-[13px] font-semibold press shrink-0">
                  Edit
                </button>
              </div>
            </div>
          </MandateCard>

          <div className="rounded-[22px] border border-line p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Talk to it</div>
            <div className="font-heading text-[18px] font-black tight mt-0.5 mb-3">Ask your agent anything</div>
            <Ask dark={false} coin={mine[0]?.coin} />
            <div className="mt-3 border-t border-line pt-1">
              <Floor lines={data.feed} max={6} showMine={false} empty="Nothing yet. It tells you here when it finds something for you." />
            </div>
          </div>

          <div className="rounded-[22px] border border-line p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Kept promises</div>
                <div className="font-heading text-[18px] font-black tight mt-0.5">Your finished trades</div>
              </div>
              <Link href="/record" className="text-[13px] font-semibold text-ink-3 flex items-center gap-0.5">
                Everyone&rsquo;s <IconChevron size={13} />
              </Link>
            </div>
            {past.length ? (
              <div className="grid gap-2 mt-3">
                {past.slice(0, 5).map(p => (
                  <Ticket key={p.id} t={p} now={now} />
                ))}
              </div>
            ) : (
              <p className="text-[13.5px] text-ink-3 mt-3 leading-snug">None yet. Each trade it finishes for you lands here with the plan it sealed before buying.</p>
            )}
          </div>
        </aside>
      </div>

      <Sheet open={shot != null} onClose={() => setShot(null)} title={shot ? `The chart ParallaxPay read on ${shot.coin}` : ''}>
        {shot && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/near/chart/pos-${shot.id}`} alt={`The ${shot.coin} chart behind this plan`} className="w-full rounded-[14px] border border-line" />
            <p className="text-[13px] text-ink-3 mt-3 leading-snug">The exact image it read when it sealed this plan: four timeframes, its support and resistance, and money flow.</p>
          </>
        )}
      </Sheet>
      <FundSheet open={sheet === 'fund'} onClose={() => setSheet(null)} onDone={refresh} />
      <WithdrawSheet open={sheet === 'withdraw'} onClose={() => setSheet(null)} member={member} onDone={refresh} />
      <RulesSheet open={sheet === 'rules'} onClose={() => setSheet(null)} current={member.rules} onDone={refresh} />
    </div>
  )
}
