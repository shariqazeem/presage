'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconBack, IconCheck, IconLock, IconLive, IconWallet } from '@/components/icons'
import { NearButton, money, qty } from '@/components/near/kit'
import { LivePrice } from '@/components/near/motion'
import { useNear } from '@/components/near/NearWallet'
import { Sparkline, signedPct } from '@/components/near/primitives'
import { sayError, tellAgent } from '@/components/near/sheets'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import { COINS, USDC, USDC_ID } from '@/lib/near/config'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { ftBalance } from '@/lib/near/rpc'
import { depositTx, joinTx } from '@/lib/near/tx'
import { fromUnits, toUnits } from '@/lib/near/units'
import type { Rules } from '@/lib/near/vault'

const SAVED = 'parallaxpay_rules'
const STEPS = ['hello', 'mode', 'style', 'coins', 'size', 'contract', 'fund', 'done'] as const
type Step = (typeof STEPS)[number]

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

/** A big tappable choice: picked gets the ink fill and a check. */
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

function Title({ kicker, children, sub }: { kicker?: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      {kicker && <div className="text-[13px] font-semibold text-ink-3">{kicker}</div>}
      <h1 className="font-heading text-[32px] md:text-[40px] leading-[1.04] font-black tight mt-1">{children}</h1>
      {sub && <p className="text-[15.5px] text-ink-2 leading-snug mt-2.5">{sub}</p>}
    </div>
  )
}

/** Hiring ParallaxPay: one decision per screen, then one signature, then funds. */
export default function Start() {
  const router = useRouter()
  const { accountId, send } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk, refetch } = useDesk(accountId)
  const [step, setStep] = useState<Step>('hello')
  const [rules, setRules] = useState<Rules>(defaults)
  const [busy, setBusy] = useState(false)
  const [wallet, setWallet] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const set = (patch: Partial<Rules>) => setRules(r => ({ ...r, ...patch }))
  const joined = Boolean(desk?.member)
  const vaultLive = agent?.vault != null

  // Choices survive a reload, and the wait for the vault to open.
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
  // A member who comes back lands on funding, not on the rules again.
  useEffect(() => {
    if (joined && STEPS.indexOf(step) < STEPS.indexOf('fund')) setStep('fund')
  }, [joined, step])
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
  const watching = useMemo(() => [...(agent?.reads ?? [])].sort((a, b) => COINS.findIndex(c => c.symbol === a.coin) - COINS.findIndex(c => c.symbol === b.coin)), [agent])
  const lead = watching.find(r => r.setup) ?? watching[0]

  const join = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const [hash] = await send([joinTx(rules)])
      await tellAgent(accountId, hash)
      await refetch()
      setStep('fund')
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
  if (step === 'hello') primary = { label: 'Set my rules', onClick: next }
  if (step === 'coins') primary = { label: rules.coins.length ? 'Continue' : 'Pick at least one coin', onClick: next, disabled: !rules.coins.length }
  if (step === 'contract') {
    if (!vaultLive) primary = { label: 'The vault opens very soon', disabled: true }
    else if (!accountId) primary = { label: '', node: <NearButton variant="full" label="Connect a NEAR wallet to sign" /> }
    else primary = { label: busy ? 'Confirm in your wallet…' : `Sign and join as ${accountId}`, onClick: join, disabled: busy }
  }
  if (step === 'fund') {
    const n = Number(amount)
    primary = { label: busy ? 'Confirm in your wallet…' : n > 0 ? `Add ${money(n)}` : 'Add USDC', onClick: fund, disabled: busy || !(n > 0) || (wallet != null && n > wallet) }
  }
  if (step === 'done') primary = { label: 'Open my desk', onClick: () => router.push('/desk') }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="max-w-[560px] mx-auto px-4 h-[56px] flex items-center gap-3">
          {step !== 'done' ? (
            <button onClick={back} className="w-10 h-10 -ml-2 rounded-full grid place-items-center press hover:bg-paper-2" aria-label="Back">
              <IconBack size={20} />
            </button>
          ) : (
            <span className="w-10" />
          )}
          <div className="flex-1 flex gap-1.5">
            {STEPS.slice(0, -1).map((s, k) => (
              <span key={s} className={cx('h-[4px] flex-1 rounded-full transition-colors duration-300', k < i ? 'bg-ink' : k === i ? 'foil-line' : 'bg-line')} />
            ))}
          </div>
          <Link href="/" className="text-[13.5px] font-semibold text-ink-3 press">
            Close
          </Link>
        </div>
      </header>

      <main key={step} className="flex-1 max-w-[560px] w-full mx-auto px-5 pt-4 pb-40 animate-[rise_.3s_ease-out]">
        {step === 'hello' && (
          <div className="pt-4">
            <div className="relative w-fit">
              <span className="absolute -inset-3 rounded-[28px] foil opacity-50 blur-[18px] animate-[soft-pulse_2.6s_ease-in-out_infinite]" />
              <span className="relative block">
                <Mark size={84} />
              </span>
            </div>
            <div className="mt-6">
              <Title kicker="Meet your agent" sub="I trade crypto for you on NEAR. You set the rules, I follow them, and the vault makes sure I can't break them.">
                Hi, I’m ParallaxPay.
              </Title>
            </div>
            {lead && (
              <div className="mt-6 rounded-[22px] bg-ink text-white p-4 relative overflow-hidden">
                <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
                <div className="flex items-center gap-2 text-[12.5px] text-[#A1A1AA]">
                  <span className="w-1.5 h-1.5 rounded-full bg-up-d animate-[soft-pulse_2s_ease-in-out_infinite]" /> Right now
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="font-heading text-[20px] font-black tight">{lead.coin}</span>
                  <LivePrice value={lead.price} format={money} className="text-[24px] font-semibold" />
                  <span className={cx('num text-[13px]', (lead.change24h ?? 0) >= 0 ? 'text-up-d' : 'text-down-d')}>{signedPct(lead.change24h)}</span>
                </div>
                <p className="text-[14px] text-[#E6E6E3] leading-snug mt-2">{lead.line.replace(/^\S+ \$[\d,.]+,?\s*/, '').replace(/^./, c => c.toUpperCase())}</p>
              </div>
            )}
            <ul className="mt-6 grid gap-3.5">
              {(
                [
                  [IconWallet, 'Your money stays in your own account', 'I trade from your account in the ParallaxPay vault. You can withdraw any time.'],
                  [IconLock, 'Your rules are enforced on chain', 'How much, how often and which coins live on NEAR. The vault refuses anything outside them.'],
                  [IconLive, 'Every plan is sealed before I trade', 'Stop, target and reasons are fingerprinted on NEAR first and opened after, wins and losses.'],
                ] as const
              ).map(([Icon, t, d]) => (
                <li key={t} className="flex gap-3.5">
                  <span className="w-10 h-10 rounded-full bg-paper-2 grid place-items-center shrink-0">
                    <Icon size={18} />
                  </span>
                  <div>
                    <div className="font-semibold text-[15px]">{t}</div>
                    <p className="text-[14px] text-ink-2 leading-snug mt-0.5">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 'mode' && (
          <div>
            <Title kicker="1 of 4" sub="You can switch whenever you like, and stop me with one tap.">
              How should I work with you?
            </Title>
            <div className="grid gap-3 mt-6">
              <Option on={!rules.autopilot} onClick={() => set({ autopilot: false })}>
                <div className="font-heading text-[20px] font-black tight">Ask first</div>
                <p className={cx('text-[14px] leading-snug mt-1 pr-8', !rules.autopilot ? 'text-white/75' : 'text-ink-2')}>I seal a plan and ask you. You approve it from your wallet, or let it pass.</p>
                <div className={cx('mt-4 rounded-[16px] p-3 flex items-center gap-3', !rules.autopilot ? 'bg-white/10' : 'bg-paper-2')}>
                  <Mark size={30} />
                  <div className="min-w-0 flex-1 text-[13px] leading-snug">
                    <b>Buy $25 of NEAR?</b> On support, momentum washed out. Stop $3.71.
                  </div>
                  <span className={cx('text-[12.5px] font-semibold rounded-full px-3 h-8 grid place-items-center shrink-0', !rules.autopilot ? 'bg-white text-ink' : 'bg-ink text-white')}>Approve</span>
                </div>
              </Option>
              <Option on={rules.autopilot} onClick={() => set({ autopilot: true })}>
                <div className="font-heading text-[20px] font-black tight">Autopilot</div>
                <p className={cx('text-[14px] leading-snug mt-1 pr-8', rules.autopilot ? 'text-white/75' : 'text-ink-2')}>I trade on my own, inside the limits you set next. Every plan is still sealed first.</p>
                <div className={cx('mt-4 rounded-[16px] p-3 flex items-center gap-3', rules.autopilot ? 'bg-white/10' : 'bg-paper-2')}>
                  <Mark size={30} />
                  <div className="min-w-0 flex-1 text-[13px] leading-snug">
                    <b>Bought $25 of NEAR</b> at $3.74. Plan sealed on NEAR. Watching the stop.
                  </div>
                </div>
              </Option>
            </div>
          </div>
        )}

        {step === 'style' && (
          <div>
            <Title kicker="2 of 4" sub="How good a setup has to look before I act on it.">
              How picky should I be?
            </Title>
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
            <Title kicker="3 of 4" sub="I always come back to USDC. Pick as many as you like.">
              What should I trade?
            </Title>
            <div className="grid grid-cols-2 gap-3 mt-6">
              {COINS.map(c => {
                const on = rules.coins.includes(c.id)
                const r = watching.find(x => x.coin === c.symbol)
                return (
                  <Option key={c.id} on={on} onClick={() => set({ coins: on ? rules.coins.filter(x => x !== c.id) : [...rules.coins, c.id] })} className="!p-3.5">
                    <div className="font-heading text-[19px] font-black tight">{c.symbol}</div>
                    <div className={cx('text-[12.5px]', on ? 'text-white/70' : 'text-ink-3')}>{c.name}</div>
                    <div className="mt-3">
                      <Sparkline points={r?.spark ?? []} w={120} h={30} night={on} />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="num text-[14px]">{r ? money(r.price) : '—'}</span>
                      <span className={cx('num text-[12px]', (r?.change24h ?? 0) >= 0 ? (on ? 'text-up-d' : 'text-up') : on ? 'text-down-d' : 'text-down')}>{signedPct(r?.change24h)}</span>
                    </div>
                  </Option>
                )
              })}
            </div>
          </div>
        )}

        {step === 'size' && (
          <div>
            <Title kicker="4 of 4" sub="The most I put into one trade, and how many new trades a day.">
              How big should I go?
            </Title>
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
              At most <b className="text-ink">{money(size * rules.trades_per_day)}</b> a day goes into new trades.
            </p>
          </div>
        )}

        {step === 'contract' && (
          <div>
            <Title kicker="Your agent’s contract" sub="Signing writes this into the vault on NEAR. It costs 0.02 NEAR for storage, returned if you ever leave.">
              Here’s our deal
            </Title>
            <div className="mt-6 rounded-[24px] bg-ink text-white relative overflow-hidden">
              <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
              <div className="p-5 flex items-center gap-3">
                <Mark size={40} />
                <div className="min-w-0">
                  <div className="font-semibold">ParallaxPay</div>
                  <div className="text-[12.5px] text-[#A1A1AA] truncate">works for {accountId ?? 'you'} · vault.parallaxpay.near</div>
                </div>
                <span className="ml-auto w-12 h-12 rounded-full foil grid place-items-center shrink-0">
                  <span className="w-6 h-6 rounded-full bg-ink grid place-items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-white" />
                  </span>
                </span>
              </div>
              <div className="perf" style={{ ['--notch' as string]: '#fff' }} />
              <dl className="p-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[14.5px]">
                <dt className="text-[#8A8A92]">How</dt>
                <dd className="text-right">{rules.autopilot ? 'Autopilot' : 'Asks you first'}</dd>
                <dt className="text-[#8A8A92]">Style</dt>
                <dd className="text-right">{STYLES[rules.style]?.name}</dd>
                <dt className="text-[#8A8A92]">Coins</dt>
                <dd className="text-right">{coinsOf(rules)}</dd>
                <dt className="text-[#8A8A92]">Largest buy</dt>
                <dd className="text-right num">{money(size)}</dd>
                <dt className="text-[#8A8A92]">Buys a day</dt>
                <dd className="text-right num">{rules.trades_per_day}</dd>
                <dt className="text-[#8A8A92]">Withdraw</dt>
                <dd className="text-right">Any time, to you only</dd>
              </dl>
            </div>
            {!vaultLive && (
              <p className="text-[14px] text-ink-2 leading-snug mt-4">
                <b className="text-ink">The vault opens on NEAR mainnet very soon.</b> Your rules are saved on this device; come back and sign in a moment. It has passed its full end-to-end test on{' '}
                <a href="https://testnet.nearblocks.io/address/vault.pp-e2e-mw2mf9t4.testnet" target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">
                  testnet
                </a>
                .
              </p>
            )}
          </div>
        )}

        {step === 'fund' && (
          <div>
            <Title kicker="You’re in" sub="USDC moves from your wallet into your account in the vault. I trade from there, inside your rules.">
              Give me something to work with
            </Title>
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
              I’ll add funds later
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="pt-10 text-center">
            <div className="relative w-fit mx-auto">
              <span className="absolute -inset-6 rounded-full foil opacity-60 blur-[28px] animate-[soft-pulse_2s_ease-in-out_infinite]" />
              <span className="relative block">
                <Mark size={96} />
              </span>
            </div>
            <h1 className="font-heading text-[36px] md:text-[44px] leading-[1.04] font-black tight mt-8">I’m on it.</h1>
            <p className="text-[16px] text-ink-2 leading-snug mt-3 max-w-[420px] mx-auto">
              I’m watching {coinsOf(desk?.member?.rules ?? rules) || 'the market'} for you. {(desk?.member?.rules ?? rules).autopilot ? 'When a setup fits your rules I’ll trade it and seal the plan first.' : 'When a setup fits your rules I’ll seal the plan and ask you on your desk.'}
            </p>
            <Link href="/" className="inline-block mt-4 text-[14px] font-semibold text-ink-3 underline decoration-line underline-offset-2">
              Watch the floor
            </Link>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-white via-white to-white/0 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="max-w-[560px] mx-auto px-5">
          {primary.node ?? (
            <button onClick={primary.onClick} disabled={primary.disabled} className="w-full h-[56px] rounded-[18px] bg-ink text-white font-semibold text-[16px] press disabled:opacity-40">
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
