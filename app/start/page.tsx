'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconBack, IconCheck } from '@/components/icons'
import { AgentDrawing } from '@/components/near/AgentDrawing'
import { FundFlow } from '@/components/near/Funding'
import { usd } from '@/components/near/kit'
import { MandateCard } from '@/components/near/Mandate'
import { useNear } from '@/components/near/NearWallet'
import { PerDayPicker, SizePicker } from '@/components/near/SizePicker'
import { WouldDoCard } from '@/components/near/Watching'
import { CoinChooser } from '@/components/near/coins'
import { ranked } from '@/lib/near/rank'
import { focusOf, voice } from '@/components/near/Stage'
import { Mark } from '@/components/shell/Mark'
import { cx } from '@/components/ui'
import { USDC } from '@/lib/near/config'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { fromUnits, toUnits } from '@/lib/near/units'
import { MAX_COINS, allowsCoin, coinsInWords, type Rules } from '@/lib/near/vault'
import { saveRules, savedRules, startWatching, stopWatching } from '@/lib/near/watch'

const STEPS = ['meet', 'mode', 'style', 'coins', 'size', 'ready', 'fund', 'done'] as const
type Step = (typeof STEPS)[number]
const NIGHT: Step[] = ['meet', 'done']
const MANDATE_STEPS: Step[] = ['mode', 'style', 'coins', 'size']

const STYLES = [
  { id: 0, name: 'Calm', line: 'Only my best setups. Fewer trades, the cleanest charts.', level: 1 },
  { id: 1, name: 'Balanced', line: 'My best setups, and strong ones sized down a little.', level: 2 },
  { id: 2, name: 'Bold', line: 'Good setups too, at half size. More trades, more noise.', level: 3 },
]
function defaults(): Rules {
  return { autopilot: false, max_trade: toUnits(25, USDC.decimals).toString(), trades_per_day: 2, coins: [], style: 1 }
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
    { key: 'coins', text: rules.coins.length ? coinsInWords(rules.coins).replace(' and ', ', ') : 'Any coin' },
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

/* ------------------------------------------------------------------ the flow */

/** Hiring ParallaxPay: meet it, write its mandate one answer at a time, start it (no wallet needed), fund it when ready. */
export default function Start() {
  const router = useRouter()
  const { accountId } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk, refetch } = useDesk(accountId)
  const [step, setStep] = useState<Step>('meet')
  const [rules, setRules] = useState<Rules>(defaults)
  // How it ended: funded (signed with money in), signed only, or watching before funding.
  const [outcome, setOutcome] = useState<'funded' | 'joined' | 'watching' | null>(null)
  const set = (patch: Partial<Rules>) => setRules(r => ({ ...r, ...patch }))
  const member = desk?.member ?? null
  const vaultLive = agent?.vault != null
  const night = NIGHT.includes(step)

  // Answers survive a reload; "Edit" on your agent comes straight back to the mandate.
  useEffect(() => {
    const s = savedRules()
    if (s) setRules({ ...defaults(), ...s })
    if (new URLSearchParams(window.location.search).has('edit')) setStep('mode')
  }, [])
  useEffect(() => saveRules(rules), [rules])
  // A member who comes back lands on funding, not on the mandate again.
  useEffect(() => {
    if (member && !outcome && STEPS.indexOf(step) < STEPS.indexOf('fund')) setStep('fund')
  }, [member, outcome, step])

  const i = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)])
  const back = () => (i === 0 ? router.push('/') : setStep(STEPS[i - 1]))
  const size = fromUnits(rules.max_trade, USDC.decimals)
  const reads = useMemo(() => ranked(agent?.reads ?? []), [agent])
  const lead = reads.find(r => r.setup) ?? [...reads].sort((a, b) => (b.checks ?? []).filter(c => c.ok).length - (a.checks ?? []).filter(c => c.ok).length)[0]
  const mine = reads.filter(r => allowsCoin(member?.rules ?? rules, r.token))
  const mineLead = mine.find(r => r.setup) ?? mine[0]

  // Hired before funding: the mandate stays on this device and your agent starts showing what it would do.
  const watch = () => {
    startWatching(rules)
    setOutcome('watching')
    setStep('done')
  }

  // The pinned button at the bottom: what it says and does depends on the step.
  let primary: { label: string; onClick?: () => void; disabled?: boolean; node?: ReactNode; secondary?: { label: string; onClick: () => void } } = { label: 'Continue', onClick: next }
  if (step === 'meet') primary = { label: 'Write my mandate', onClick: next }
  if (step === 'size') primary = { label: 'See my mandate', onClick: next }
  if (step === 'ready') primary = { label: 'Start my agent', onClick: watch, secondary: { label: 'Fund it now instead', onClick: next } }
  if (step === 'fund') primary = { label: '', node: <></>, secondary: member ? { label: 'I’ll add funds later', onClick: () => setStep('done') } : { label: 'Not now, just watch for me', onClick: watch } }
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
                  { node: <Bubble>{lead ? `I read every coin on Rhea that trades, all day. Here's ${lead.coin}, right now:` : 'I read every coin on Rhea that trades, all day, and draw what I see.'}</Bubble>, wait: 900 },
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
                    <span className={cx('block text-[10.5px] font-semibold uppercase tracking-[0.07em] mb-0.5', !rules.autopilot ? 'text-white/55' : 'text-ink-3')}>For example</span>
                    <b>I&rsquo;d buy $25 of NEAR.</b> It&rsquo;s on support and money flow bottomed. Stop $3.71.
                  </div>
                  <span aria-hidden className={cx('text-[12.5px] font-semibold rounded-full px-3 h-8 grid place-items-center shrink-0 border', !rules.autopilot ? 'border-white/30 text-white/70' : 'border-line text-ink-3')}>Approve</span>
                </div>
              </Option>
              <Option on={rules.autopilot} onClick={() => set({ autopilot: true })}>
                <div className="font-heading text-[20px] font-black tight">Autopilot</div>
                <p className={cx('text-[14px] leading-snug mt-1 pr-8', rules.autopilot ? 'text-white/75' : 'text-ink-2')}>I trade on my own, inside the limits you set next. Every plan is still sealed first.</p>
                <div className={cx('mt-4 rounded-[16px] p-3 flex items-center gap-3', rules.autopilot ? 'bg-white/10' : 'bg-paper-2')}>
                  <Mark size={30} className="shrink-0" />
                  <div className="min-w-0 flex-1 text-[13px] leading-snug">
                    <span className={cx('block text-[10.5px] font-semibold uppercase tracking-[0.07em] mb-0.5', rules.autopilot ? 'text-white/55' : 'text-ink-3')}>For example</span>
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
            <Question sub="I always come back to USDC.">What should I trade for you?</Question>
            <div className="mt-6">
              <Option on={rules.coins.length === 0} onClick={() => set({ coins: [] })}>
                <div className="font-heading text-[20px] font-black tight">Any coin I find</div>
                <p className={cx('text-[14px] leading-snug mt-1 pr-8', rules.coins.length === 0 ? 'text-white/75' : 'text-ink-2')}>
                  I watch every coin I can trade on Rhea and take the best setup among them.
                </p>
              </Option>
            </div>
            <div className="mt-5 mb-2.5 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-ink-2">Or only these</span>
              <span className="text-[12px] text-ink-3">{rules.coins.length ? `${rules.coins.length} of ${MAX_COINS}` : `up to ${MAX_COINS}`}</span>
            </div>
            <CoinChooser
              reads={reads}
              chosen={rules.coins}
              max={MAX_COINS}
              onToggle={id => set({ coins: rules.coins.includes(id) ? rules.coins.filter(x => x !== id) : rules.coins.length >= MAX_COINS ? rules.coins : [...rules.coins, id] })}
            />
          </div>
        )}

        {step === 'size' && (
          <div>
            <Question sub="The most I put into one trade, and how many new trades a day.">How big should I go?</Question>
            <div className="mt-8">
              <SizePicker value={size} onChange={v => set({ max_trade: toUnits(v, USDC.decimals).toString() })} />
            </div>
            <div className="mt-6 rounded-[22px] border border-line p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-[15px]">Buys a day</div>
                <div className="text-[13px] text-ink-3">Selling back to USDC is never limited</div>
              </div>
              <PerDayPicker value={rules.trades_per_day} onChange={n => set({ trades_per_day: n })} />
            </div>
            <p className="text-[14px] text-ink-2 leading-snug mt-4 text-center">
              At most <b className="text-ink">{usd(size * rules.trades_per_day, { trim: true })}</b> a day goes into new trades.
            </p>
          </div>
        )}

        {step === 'ready' && (
          <div>
            <Question sub="I can start on it now and show you what I'd do for you, live. Fund me whenever you want me to act.">Here&rsquo;s your mandate.</Question>
            <div className="mt-6">
              <MandateCard rules={rules} state="draft" />
            </div>
          </div>
        )}

        {step === 'fund' && (
          <div>
            <Question sub={member ? 'USDC moves into your account in the vault. I trade from there, inside your mandate.' : 'Sign your mandate on NEAR and move USDC into your own account in the vault, in one confirmation.'}>Give me something to work with.</Question>
            <div className="mt-6">
              <FundFlow
                rules={rules}
                member={member}
                vaultLive={vaultLive}
                onDone={how => {
                  stopWatching()
                  void refetch()
                  setOutcome(how)
                  setStep('done')
                }}
              />
            </div>
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
              {outcome === 'watching' ? (
                <Sequence
                  items={[
                    { node: <Bubble>I&rsquo;m watching {coinsInWords(rules.coins, 'every coin I can trade')} for you now. Here&rsquo;s what I&rsquo;d do with your mandate this minute:</Bubble>, wait: 1100 },
                    { node: <WouldDoCard rules={rules} reads={agent?.reads ?? []} className="border border-white/[0.08]" />, wait: 2200 },
                    { node: <Bubble>Fund me whenever you want me to act. Until then I&rsquo;ll keep showing you what I&rsquo;d do, on your agent&rsquo;s page.</Bubble> },
                  ]}
                />
              ) : (
              <Sequence
                items={[
                  { node: <Bubble>{outcome === 'funded' || outcome === 'joined' ? 'Your mandate is signed on NEAR. ' : ''}I&rsquo;m watching {coinsInWords((member?.rules ?? rules).coins, 'every coin I can trade')} for you now.</Bubble>, wait: 1000 },
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
                  { node: <Bubble>{(member?.rules ?? rules).autopilot ? 'When a setup fits your mandate, I seal the plan on NEAR and trade it. You can stop me any time.' : 'When a setup fits your mandate, I seal the plan on NEAR and ask you first.'}</Bubble> },
                ]}
              />
              )}
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
          {primary.secondary && (
            <button onClick={primary.secondary.onClick} className={cx('w-full h-11 mt-1.5 rounded-[14px] text-[14.5px] font-semibold press', night ? 'text-[#C9C9CF]' : 'text-ink-2')}>
              {primary.secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
