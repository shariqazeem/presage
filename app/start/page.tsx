'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { IconBack, IconCheck } from '@/components/icons'
import { AgentDrawing } from '@/components/near/AgentDrawing'
import { NearButton, qty, usd } from '@/components/near/kit'
import { MandateCard } from '@/components/near/Mandate'
import { useNear } from '@/components/near/NearWallet'
import { sayError, tellAgent } from '@/components/near/sheets'
import { focusOf, voice } from '@/components/near/Stage'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import { COINS, USDC, USDC_ID } from '@/lib/near/config'
import { px } from '@/lib/near/drawing'
import { useAgentState, useDesk, type CoinRead } from '@/lib/near/hooks'
import { ftBalance } from '@/lib/near/rpc'
import { depositTx, joinTx } from '@/lib/near/tx'
import { fromUnits, toUnits } from '@/lib/near/units'
import type { Rules } from '@/lib/near/vault'

const SAVED = 'parallaxpay_rules'
const STEPS = ['meet', 'mode', 'style', 'coins', 'size', 'sign', 'fund', 'done'] as const
type Step = (typeof STEPS)[number]
const NIGHT: Step[] = ['meet', 'done']
const MANDATE_STEPS: Step[] = ['mode', 'style', 'coins', 'size']

const STYLES = [
  { id: 0, name: 'Calm', line: 'Only my best setups. Fewer trades, the cleanest charts.', level: 1 },
  { id: 1, name: 'Balanced', line: 'My best setups, and strong ones sized down a little.', level: 2 },
  { id: 2, name: 'Bold', line: 'Good setups too, at half size. More trades, more noise.', level: 3 },
]
const SIZES = [10, 25, 50, 100]

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const coinsOf = (r: Rules) => listOf(r.coins.map(id => COINS.find(c => c.id === id)?.symbol ?? '').filter(Boolean))

function defaults(): Rules {
  return { autopilot: false, max_trade: toUnits(25, USDC.decimals).toString(), trades_per_day: 2, coins: [COINS[0].id], style: 1 }
}

/* ------------------------------------------------------------------ the agent talking */

function Typing({ night }: { night: boolean }) {
  return (
    <div className={cx('w-fit rounded-[18px] rounded-tl-[6px] px-4 h-11 flex items-center gap-1.5', night ? 'bg-white/[0.08]' : 'bg-paper-2')} aria-hidden>
      {[0, 1, 2].map(i => (
        <span key={i} className={cx('w-1.5 h-1.5 rounded-full animate-[soft-pulse_1s_ease-in-out_infinite]', night ? 'bg-white' : 'bg-ink')} style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </div>
  )
}

/** What it says, one message after another, with a typing indicator in between. */
function Sequence({ items, night = true }: { items: { node: ReactNode; wait?: number }[]; night?: boolean }) {
  const [n, setN] = useState(1)
  const wait = items[n - 1]?.wait ?? 1100
  useEffect(() => {
    if (n >= items.length) return
    const t = setTimeout(() => setN(k => k + 1), wait)
    return () => clearTimeout(t)
  }, [n, items.length, wait])
  return (
    <div className="grid gap-2.5">
      {items.slice(0, n).map((it, i) => (
        <div key={i} className="animate-[rise_.35s_ease-out]">
          {it.node}
        </div>
      ))}
      {n < items.length && <Typing night={night} />}
    </div>
  )
}

function Bubble({ children, night = true }: { children: ReactNode; night?: boolean }) {
  return <div className={cx('w-fit max-w-full rounded-[18px] rounded-tl-[6px] px-4 py-3 text-[15.5px] leading-snug', night ? 'bg-white/[0.08] text-[#F4F4F2]' : 'bg-paper-2 text-ink')}>{children}</div>
}

/** The agent asking you something. */
function Question({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <Mark size={38} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="w-fit rounded-[20px] rounded-tl-[6px] bg-ink text-white px-4 py-3 font-heading text-[22px] md:text-[26px] font-black tight leading-[1.1]">{children}</div>
        {sub && <p className="text-[14.5px] text-ink-2 leading-snug mt-2 ml-1">{sub}</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the mandate, filling in */

function MandateStrip({ rules, step }: { rules: Rules; step: Step }) {
  const at = MANDATE_STEPS.indexOf(step)
  const parts = [
    { key: 'mode', text: rules.autopilot ? 'Autopilot' : 'Asks first' },
    { key: 'style', text: STYLES[rules.style]?.name ?? 'Balanced' },
    { key: 'coins', text: rules.coins.length ? coinsOf(rules).replace(' and ', ', ') : 'No coins' },
    { key: 'size', text: `${usd(fromUnits(rules.max_trade, USDC.decimals), { trim: true })} × ${rules.trades_per_day}/day` },
  ]
  return (
    <div className="rounded-[18px] border border-line bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Your mandate</span>
        <span className="num text-[11.5px] text-ink-3">{at + 1} of 4</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {parts.map((p, i) => (
          <span
            key={p.key}
            className={cx(
              'rounded-full h-[28px] px-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors duration-300',
              i < at && 'bg-ink text-white',
              i === at && 'bg-white text-ink ring-2 ring-offset-0 ring-[#EC4899]/60',
              i > at && 'border border-dashed border-line text-ink-3',
            )}
          >
            {i < at && <IconCheck size={11} weight={3} />}
            {i <= at ? p.text : ['How', 'Style', 'Coins', 'Size'][i]}
          </span>
        ))}
      </div>
    </div>
  )
}

function Option({ on, onClick, children, className = '' }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button onClick={onClick} className={cx('relative w-full text-left rounded-[22px] border-2 p-4 press', on ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink-3', className)}>
      {on && (
        <span className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full bg-white text-ink grid place-items-center">
          <IconCheck size={13} weight={3} />
        </span>
      )}
      {children}
    </button>
  )
}

/** A coin to trade, shown the way the agent sees it: its drawing, its checks. */
function CoinPick({ symbol, name, r, on, onClick }: { symbol: string; name: string; r?: CoinRead; on: boolean; onClick: () => void }) {
  const checks = r?.checks ?? []
  return (
    <button onClick={onClick} aria-pressed={on} className={cx('relative text-left rounded-[20px] p-3 bg-ink text-white press border-2 transition-colors', on ? 'border-[#EC4899]/70' : 'border-transparent')}>
      <span className={cx('absolute top-3 right-3 w-6 h-6 rounded-full grid place-items-center', on ? 'foil text-white' : 'border border-white/20')}>{on && <IconCheck size={12} weight={3} />}</span>
      <div className="font-heading text-[18px] font-black tight">{symbol}</div>
      <div className="text-[12px] text-[#8A8A92]">{name}</div>
      <AgentDrawing coin={symbol} tf="1h" size="thumb" focus={r ? focusOf(r) : null} className="h-[56px] mt-2" />
      <div className="mt-2 flex items-baseline justify-between">
        <span className="num text-[13px]">{r ? px(r.price) : '—'}</span>
        <span className="num text-[11.5px] text-[#8A8A92]">{r ? `${checks.filter(c => c.ok).length}/${checks.length} checks` : ''}</span>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ the flow */

/** Hiring ParallaxPay: meet it, write its mandate one answer at a time, sign it on NEAR, fund it. */
export default function Start() {
  const router = useRouter()
  const { accountId, send } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk, refetch } = useDesk(accountId)
  const [step, setStep] = useState<Step>('meet')
  const [rules, setRules] = useState<Rules>(defaults)
  const [busy, setBusy] = useState(false)
  const [signed, setSigned] = useState(false)
  const [saved, setSaved] = useState(false)
  const [wallet, setWallet] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const set = (patch: Partial<Rules>) => setRules(r => ({ ...r, ...patch }))
  const joined = Boolean(desk?.member)
  const vaultLive = agent?.vault != null
  const night = NIGHT.includes(step)

  // Answers survive a reload, and the wait for the vault to open.
  useEffect(() => {
    try {
      const s = localStorage.getItem(SAVED)
      if (s) setRules({ ...defaults(), ...(JSON.parse(s) as Rules) })
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(SAVED, JSON.stringify(rules))
    } catch {}
  }, [rules])
  // A member who comes back lands on funding, not on the mandate again.
  useEffect(() => {
    if (joined && !signed && STEPS.indexOf(step) < STEPS.indexOf('fund')) setStep('fund')
  }, [joined, signed, step])
  useEffect(() => {
    if (step !== 'fund' || !accountId) return
    ftBalance(USDC_ID, accountId)
      .then(b => setWallet(fromUnits(b, USDC.decimals)))
      .catch(() => setWallet(0))
  }, [step, accountId])

  const i = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)])
  const back = () => (i === 0 ? router.push('/') : setStep(STEPS[i - 1]))
  const size = fromUnits(rules.max_trade, USDC.decimals)
  const reads = useMemo(() => [...(agent?.reads ?? [])].sort((a, b) => COINS.findIndex(c => c.symbol === a.coin) - COINS.findIndex(c => c.symbol === b.coin)), [agent])
  const lead = reads.find(r => r.setup) ?? [...reads].sort((a, b) => (b.checks ?? []).filter(c => c.ok).length - (a.checks ?? []).filter(c => c.ok).length)[0]
  const mine = reads.filter(r => (desk?.member?.rules ?? rules).coins.includes(r.token))
  const mineLead = mine.find(r => r.setup) ?? mine[0]

  const join = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const [hash] = await send([joinTx(rules)])
      await tellAgent(accountId, hash)
      setSigned(true)
      await refetch()
      setTimeout(() => setStep('fund'), 1400)
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }
  const fund = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const [hash] = await send([depositTx(toUnits(amount, USDC.decimals))])
      await tellAgent(accountId, hash)
      await refetch()
      setStep('done')
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }

  // The pinned button at the bottom: what it says and does depends on the step.
  let primary: { label: string; onClick?: () => void; disabled?: boolean; node?: ReactNode } = { label: 'Continue', onClick: next }
  if (step === 'meet') primary = { label: 'Write my mandate', onClick: next }
  if (step === 'coins') primary = { label: rules.coins.length ? 'Continue' : 'Pick at least one coin', onClick: next, disabled: !rules.coins.length }
  if (step === 'size') primary = { label: 'See my mandate', onClick: next }
  if (step === 'sign') {
    if (!vaultLive)
      primary = saved
        ? { label: 'Watch it work meanwhile', onClick: () => router.push('/') }
        : {
            label: 'Save my mandate',
            onClick: () => {
              setSaved(true)
              toast.success('Saved on this device. Sign it the moment the vault opens.')
            },
          }
    else if (!accountId) primary = { label: '', node: <NearButton variant="full" label="Connect a NEAR wallet to sign" /> }
    else primary = { label: busy ? 'Confirm in your wallet…' : signed ? 'Signed' : 'Sign on NEAR', onClick: join, disabled: busy || signed }
  }
  if (step === 'fund') {
    const n = Number(amount)
    primary = { label: busy ? 'Confirm in your wallet…' : n > 0 ? `Add ${usd(n)}` : 'Add USDC', onClick: fund, disabled: busy || !(n > 0) || (wallet != null && n > wallet) }
  }
  if (step === 'done') primary = { label: 'Open your agent', onClick: () => router.push('/desk') }

  return (
    <div className={cx('min-h-[100dvh] flex flex-col transition-colors duration-300', night ? 'bg-ink text-white' : 'bg-white text-ink')}>
      <header className={cx('sticky top-0 z-20 backdrop-blur-xl pt-[env(safe-area-inset-top)]', night ? 'bg-ink/85' : 'bg-white/90')}>
        <div className="max-w-[600px] mx-auto px-4 h-[56px] flex items-center gap-3">
          {step !== 'done' ? (
            <button onClick={back} className={cx('w-10 h-10 -ml-2 rounded-full grid place-items-center press', night ? 'hover:bg-white/10' : 'hover:bg-paper-2')} aria-label="Back">
              <IconBack size={20} />
            </button>
          ) : (
            <span className="w-10" />
          )}
          <div className="flex-1 flex gap-1.5">
            {STEPS.slice(0, -1).map((s, k) => (
              <span key={s} className={cx('h-[4px] flex-1 rounded-full transition-colors duration-300', k < i ? (night ? 'bg-white' : 'bg-ink') : k === i ? 'foil-line' : night ? 'bg-white/15' : 'bg-line')} />
            ))}
          </div>
          <Link href="/" className={cx('text-[13.5px] font-semibold press', night ? 'text-[#A1A1AA]' : 'text-ink-3')}>
            Close
          </Link>
        </div>
      </header>

      <main key={step} className="flex-1 max-w-[600px] w-full mx-auto px-5 pt-4 pb-40 animate-[rise_.3s_ease-out]">
        {step === 'meet' && (
          <div className="pt-2">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <span className="absolute -inset-2 rounded-[22px] foil opacity-50 blur-[14px] animate-[soft-pulse_2.6s_ease-in-out_infinite]" />
                <span className="relative block">
                  <Mark size={56} />
                </span>
              </div>
              <div>
                <div className="font-heading text-[24px] font-black tight leading-none">ParallaxPay</div>
                <div className="text-[13px] text-[#A1A1AA] mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-up-d animate-[soft-pulse_2s_ease-in-out_infinite]" /> AI trader · live on NEAR
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Sequence
                items={[
                  { node: <Bubble>Hi, I&rsquo;m ParallaxPay. I trade crypto for you on NEAR, from your own account.</Bubble>, wait: 1200 },
                  { node: <Bubble>{lead ? `Every 15 minutes I read four coins. Here's ${lead.coin}, right now:` : 'Every 15 minutes I read four coins and draw what I see.'}</Bubble>, wait: 900 },
                  ...(lead
                    ? [
                        {
                          node: (
                            <div className="rounded-[20px] bg-[#0E0E10] border border-white/[0.06] p-2">
                              <AgentDrawing coin={lead.coin} tf="1h" size="stage" focus={focusOf(lead)} className="aspect-[4/3.4] sm:aspect-[16/10]" />
                            </div>
                          ),
                          wait: 2200,
                        },
                        { node: <Bubble>{voice(lead)}</Bubble>, wait: 1500 },
                      ]
                    : []),
                  { node: <Bubble>You give me a mandate: how much, how often, which coins. The vault on NEAR refuses anything outside it, and I seal every plan on NEAR before I trade.</Bubble> },
                ]}
              />
            </div>
          </div>
        )}

        {MANDATE_STEPS.includes(step) && (
          <div className="mb-5">
            <MandateStrip rules={rules} step={step} />
          </div>
        )}

        {step === 'mode' && (
          <div>
            <Question sub="You can switch whenever you like, and stop me with one tap.">How should I work with you?</Question>
            <div className="grid gap-3 mt-6">
              <Option on={!rules.autopilot} onClick={() => set({ autopilot: false })}>
                <div className="font-heading text-[20px] font-black tight">Ask me first</div>
                <p className={cx('text-[14px] leading-snug mt-1 pr-8', !rules.autopilot ? 'text-white/75' : 'text-ink-2')}>I seal a plan and ask you. You approve it from your wallet, or let it pass.</p>
                <div className={cx('mt-4 rounded-[16px] p-3 flex items-center gap-3', !rules.autopilot ? 'bg-white/10' : 'bg-paper-2')}>
                  <Mark size={30} className="shrink-0" />
                  <div className="min-w-0 flex-1 text-[13px] leading-snug">
                    <b>I&rsquo;d buy $25 of NEAR.</b> It&rsquo;s on support and money flow bottomed. Stop $3.71.
                  </div>
                  <span className={cx('text-[12.5px] font-semibold rounded-full px-3 h-8 grid place-items-center shrink-0', !rules.autopilot ? 'bg-white text-ink' : 'bg-ink text-white')}>Approve</span>
                </div>
              </Option>
              <Option on={rules.autopilot} onClick={() => set({ autopilot: true })}>
                <div className="font-heading text-[20px] font-black tight">Autopilot</div>
                <p className={cx('text-[14px] leading-snug mt-1 pr-8', rules.autopilot ? 'text-white/75' : 'text-ink-2')}>I trade on my own, inside the limits you set next. Every plan is still sealed first.</p>
                <div className={cx('mt-4 rounded-[16px] p-3 flex items-center gap-3', rules.autopilot ? 'bg-white/10' : 'bg-paper-2')}>
                  <Mark size={30} className="shrink-0" />
                  <div className="min-w-0 flex-1 text-[13px] leading-snug">
                    <b>Bought $25 of NEAR</b> at $3.74. Plan sealed on NEAR. I&rsquo;m watching the stop.
                  </div>
                </div>
              </Option>
            </div>
          </div>
        )}

        {step === 'style' && (
          <div>
            <Question sub="How good a setup has to look before I act on it.">How picky should I be?</Question>
            <div className="grid gap-3 mt-6">
              {STYLES.map(s => {
                const on = rules.style === s.id
                return (
                  <Option key={s.id} on={on} onClick={() => set({ style: s.id })}>
                    <div className="flex items-center gap-4 pr-8">
                      <div className="flex gap-1 items-end">
                        {[1, 2, 3].map(k => (
                          <span key={k} className={cx('w-2 rounded-full', k === 1 ? 'h-4' : k === 2 ? 'h-6' : 'h-8', k <= s.level ? (on ? 'bg-white' : 'bg-ink') : on ? 'bg-white/20' : 'bg-line')} />
                        ))}
                      </div>
                      <div>
                        <div className="font-heading text-[20px] font-black tight">{s.name}</div>
                        <p className={cx('text-[14px] leading-snug', on ? 'text-white/75' : 'text-ink-2')}>{s.line}</p>
                      </div>
                    </div>
                  </Option>
                )
              })}
            </div>
          </div>
        )}

        {step === 'coins' && (
          <div>
            <Question sub="These are my live drawings of each one. I always come back to USDC.">What should I trade for you?</Question>
            <div className="grid grid-cols-2 gap-3 mt-6">
              {COINS.map(c => {
                const on = rules.coins.includes(c.id)
                return <CoinPick key={c.id} symbol={c.symbol} name={c.name} r={reads.find(x => x.coin === c.symbol)} on={on} onClick={() => set({ coins: on ? rules.coins.filter(x => x !== c.id) : [...rules.coins, c.id] })} />
              })}
            </div>
          </div>
        )}

        {step === 'size' && (
          <div>
            <Question sub="The most I put into one trade, and how many new trades a day.">How big should I go?</Question>
            <div className="mt-8 text-center">
              <div className="num text-[64px] font-semibold leading-none tracking-[-0.03em]">${size}</div>
              <div className="text-[13.5px] text-ink-3 mt-2">largest buy</div>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-2">
              {SIZES.map(v => (
                <button key={v} onClick={() => set({ max_trade: toUnits(v, USDC.decimals).toString() })} className={cx('h-12 rounded-[14px] num text-[15px] font-semibold press', size === v ? 'bg-ink text-white' : 'bg-paper-2 text-ink')}>
                  ${v}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-[22px] border border-line p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-[15px]">Buys a day</div>
                <div className="text-[13px] text-ink-3">Selling back to USDC is never limited</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => set({ trades_per_day: Math.max(1, rules.trades_per_day - 1) })} className="w-10 h-10 rounded-full bg-paper-2 text-[20px] font-semibold press" aria-label="Fewer">
                  −
                </button>
                <span className="num text-[22px] font-semibold w-6 text-center">{rules.trades_per_day}</span>
                <button onClick={() => set({ trades_per_day: Math.min(10, rules.trades_per_day + 1) })} className="w-10 h-10 rounded-full bg-paper-2 text-[20px] font-semibold press" aria-label="More">
                  +
                </button>
              </div>
            </div>
            <p className="text-[14px] text-ink-2 leading-snug mt-4 text-center">
              At most <b className="text-ink">{usd(size * rules.trades_per_day, { trim: true })}</b> a day goes into new trades.
            </p>
          </div>
        )}

        {step === 'sign' && (
          <div>
            <Question sub={vaultLive ? 'Signing writes it into the vault on NEAR. It costs 0.02 NEAR for storage, returned if you ever leave.' : undefined}>Here&rsquo;s your mandate.</Question>
            <div className="relative mt-6">
              <MandateCard rules={rules} state={signed ? 'signed' : 'draft'} signer={accountId} />
              {signed && (
                <span className="absolute -top-4 -right-2 w-[92px] h-[92px] rounded-full foil grid place-items-center text-white shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] animate-[stamp_.55s_cubic-bezier(.2,1.4,.4,1)_both]">
                  <span className="w-[76px] h-[76px] rounded-full border-2 border-white/70 grid place-items-center text-center text-[10.5px] font-black uppercase tracking-[0.08em] leading-tight">
                    Sealed
                    <br />
                    on NEAR
                  </span>
                </span>
              )}
            </div>
            {!vaultLive && (
              <div className="mt-4 rounded-[18px] bg-paper-2 p-4 text-[14px] text-ink-2 leading-snug">
                <b className="text-ink">{saved ? 'Saved on this device.' : 'Signing opens when the vault goes live on mainnet, very soon.'}</b>{' '}
                {saved ? 'Come back and sign it in one tap once the vault is open. Until then, you can watch it work on the floor.' : 'Save your mandate now and sign it in one tap when it opens. The vault already passed its full end-to-end test on'}{' '}
                {!saved && (
                  <>
                    <a href="https://testnet.nearblocks.io/address/vault.pp-e2e-mw2mf9t4.testnet" target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">
                      testnet
                    </a>
                    .
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'fund' && (
          <div>
            <Question sub="USDC moves from your wallet into your account in the vault. I trade from there, inside your mandate.">Give me something to work with.</Question>
            <div className="mt-8 text-center">
              <div className="flex items-center justify-center gap-1">
                <span className="num text-[56px] font-semibold text-ink-3">$</span>
                <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className="num text-[56px] font-semibold w-[220px] text-center outline-none bg-transparent placeholder:text-line" />
              </div>
              <div className="text-[13.5px] text-ink-3 mt-1">{wallet != null ? `${qty(wallet)} USDC in your wallet` : 'Checking your wallet…'}</div>
            </div>
            {wallet != null && wallet > 0 && (
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[0.25, 0.5, 1].map(f => (
                  <button key={f} onClick={() => setAmount(String(Math.floor(wallet * f * 100) / 100))} className="h-11 rounded-[14px] bg-paper-2 text-[14px] font-semibold press">
                    {f === 1 ? 'Max' : `${f * 100}%`}
                  </button>
                ))}
              </div>
            )}
            <Link href="/fund" className="mt-5 flex items-center justify-between rounded-[20px] border border-line p-4 press">
              <div>
                <div className="font-semibold text-[15px]">From another chain</div>
                <div className="text-[13px] text-ink-3">USDC, ETH, SOL or BTC through NEAR Intents</div>
              </div>
              <span className="text-[20px]">→</span>
            </Link>
            <button onClick={() => setStep('done')} className="block mx-auto mt-4 text-[13.5px] text-ink-3 press">
              I&rsquo;ll add funds later
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="pt-4">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <span className="absolute -inset-3 rounded-[24px] foil opacity-60 blur-[18px] animate-[soft-pulse_2s_ease-in-out_infinite]" />
                <span className="relative block">
                  <Mark size={60} />
                </span>
              </div>
              <h1 className="font-heading text-[36px] md:text-[44px] leading-none font-black tight">I&rsquo;m on it.</h1>
            </div>
            <div className="mt-6">
              <Sequence
                items={[
                  { node: <Bubble>I&rsquo;m watching {coinsOf(desk?.member?.rules ?? rules) || 'the market'} for you now.</Bubble>, wait: 1000 },
                  ...(mineLead
                    ? [
                        {
                          node: (
                            <div className="rounded-[20px] bg-[#0E0E10] border border-white/[0.06] p-2">
                              <AgentDrawing coin={mineLead.coin} tf="1h" size="stage" focus={focusOf(mineLead)} className="aspect-[4/3.4] sm:aspect-[16/10]" />
                            </div>
                          ),
                          wait: 2000,
                        },
                        { node: <Bubble>{voice(mineLead)}</Bubble>, wait: 1300 },
                      ]
                    : []),
                  { node: <Bubble>{(desk?.member?.rules ?? rules).autopilot ? 'When a setup fits your mandate, I seal the plan on NEAR and trade it. You can stop me any time.' : 'When a setup fits your mandate, I seal the plan on NEAR and ask you first.'}</Bubble> },
                ]}
              />
            </div>
          </div>
        )}
      </main>

      <div className={cx('fixed bottom-0 inset-x-0 z-20 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))] bg-gradient-to-t', night ? 'from-ink via-ink to-ink/0' : 'from-white via-white to-white/0')}>
        <div className="max-w-[600px] mx-auto px-5">
          {primary.node ?? (
            <button onClick={primary.onClick} disabled={primary.disabled} className={cx('w-full h-[56px] rounded-[18px] font-semibold text-[16px] press disabled:opacity-40', night ? 'bg-white text-ink' : 'bg-ink text-white')}>
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
