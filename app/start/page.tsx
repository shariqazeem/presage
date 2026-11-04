'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ActionButton, Panel } from '@/components/kit'
import { Avatar } from '@/components/near/agent'
import { NearButton, money, qty } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { RulesForm, STYLES, defaultRules } from '@/components/near/RulesForm'
import { sayError, tellAgent } from '@/components/near/sheets'
import { cx } from '@/components/ui'
import { COINS, USDC, USDC_ID } from '@/lib/near/config'
import { useAgentState, useDesk } from '@/lib/near/hooks'
import { ftBalance } from '@/lib/near/rpc'
import { depositTx, joinTx } from '@/lib/near/tx'
import { fromUnits, toUnits } from '@/lib/near/units'
import type { Rules } from '@/lib/near/vault'

const STEPS = ['Your rules', 'Join', 'Add USDC', 'Done'] as const

/** "a, b and c" */
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** What the agent will do with these rules, in one sentence the member can check before signing. */
function promise(r: Rules): string {
  const coins = listOf(r.coins.map(id => COINS.find(c => c.id === id)?.symbol ?? '').filter(Boolean)) || 'no coins yet'
  const size = money(fromUnits(r.max_trade, USDC.decimals))
  const style = { 0: 'only its best setups', 1: 'its best and strong setups', 2: 'good setups too, at half size' }[r.style as 0 | 1 | 2] ?? 'its best setups'
  return `${r.autopilot ? 'ParallaxPay trades on its own' : 'ParallaxPay asks you before every trade'}: ${coins}, up to ${size} a buy, at most ${r.trades_per_day} buy${r.trades_per_day === 1 ? '' : 's'} a day, ${style}. Selling back to USDC is never limited.`
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2 flex-1 last:flex-none">
          <span className={cx('w-7 h-7 rounded-full grid place-items-center num text-[12px] shrink-0 transition-colors', i < step ? 'bg-ink text-white' : i === step ? 'foil text-white' : 'bg-paper-2 text-ink-3')}>{i + 1}</span>
          <span className={cx('text-[13px] hidden sm:block', i === step ? 'text-ink font-semibold' : 'text-ink-3')}>{s}</span>
          {i < STEPS.length - 1 && <span className={cx('h-[2px] flex-1 rounded-full', i < step ? 'bg-ink' : 'bg-line')} />}
        </li>
      ))}
    </ol>
  )
}

/** Hiring ParallaxPay: rules, one signature to join, USDC in, and it starts watching. */
export default function Start() {
  const router = useRouter()
  const { accountId, send } = useNear()
  const { data: agent } = useAgentState()
  const { data: desk, refetch } = useDesk(accountId)
  const [rules, setRules] = useState<Rules>(defaultRules)
  const [busy, setBusy] = useState(false)
  const [wallet, setWallet] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [funded, setFunded] = useState(false)
  const joined = Boolean(desk?.member)
  const inVault = desk?.member ? fromUnits(desk.member.balances[USDC_ID] ?? '0', USDC.decimals) : 0
  const [onRules, setOnRules] = useState(true)
  const step = !joined ? (onRules ? 0 : 1) : funded || inVault > 0 ? 3 : 2

  useEffect(() => {
    if (step !== 2 || !accountId) return
    ftBalance(USDC_ID, accountId)
      .then(b => setWallet(fromUnits(b, USDC.decimals)))
      .catch(() => setWallet(0))
  }, [step, accountId])

  const join = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const [hash] = await send([joinTx(rules)])
      await tellAgent(accountId, hash)
      await refetch()
      toast.success('You’re in. Your rules are stored in the vault on NEAR.')
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
      setFunded(true)
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }

  const valid = rules.coins.length > 0
  const n = Number(amount)
  return (
    <div className="max-w-[720px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-20">
      <Progress step={step} />
      <div key={step} className="mt-7 animate-[rise_.28s_ease-out]">
          {step === 0 && (
            <>
              <div className="flex items-center gap-3">
                <Avatar actor="parallaxpay" size={44} />
                <div className="text-[14px] text-ink-2 leading-snug">
                  ParallaxPay is watching {listOf(agent?.reads.map(r => `${r.coin} at ${money(r.price)}`) ?? []) || 'the market'} right now.
                </div>
              </div>
              <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.03] font-black tight mt-5">How should it work for you?</h1>
              <p className="text-[16px] text-ink-2 mt-2 leading-snug">These are stored in the ParallaxPay vault on NEAR. The vault refuses any trade outside them. Change them whenever you like.</p>
              <Panel className="p-5 md:p-6 mt-6">
                <RulesForm rules={rules} onChange={setRules} />
              </Panel>
              <div className="sticky bottom-[calc(62px+env(safe-area-inset-bottom)+8px)] md:bottom-4 mt-4">
                <div className="rounded-[18px] bg-ink text-white p-4 shadow-xl">
                  <p className="text-[14px] leading-snug text-[#E6E6E3]">{promise(rules)}</p>
                  <button onClick={() => setOnRules(false)} disabled={!valid} className="mt-3 w-full h-12 rounded-[12px] bg-white text-ink font-semibold disabled:opacity-40">
                    {valid ? 'These are my rules' : 'Pick at least one coin'}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.03] font-black tight">One signature to join</h1>
              <p className="text-[16px] text-ink-2 mt-2 leading-snug">It writes your rules into the vault and opens your account there. It costs 0.02 NEAR for storage, returned if you ever leave.</p>
              <Panel tone="soft" className="p-5 mt-6" as="div">
                <div className="label text-ink-3">You’re signing</div>
                <p className="text-[15px] text-ink mt-2 leading-snug">{promise(rules)}</p>
                <div className="text-[13px] text-ink-3 mt-2">Style: {STYLES[rules.style]?.name}. Contract: vault.parallaxpay.near.</div>
                <button onClick={() => setOnRules(true)} className="mt-3 text-[13px] underline decoration-line underline-offset-2 text-ink-3 hover:decoration-ink">
                  Change something
                </button>
              </Panel>
              <div className="mt-5">
                {!accountId ? (
                  <>
                    <NearButton variant="full" label="Connect a NEAR wallet" />
                    <p className="text-[13px] text-ink-3 mt-2 text-center">HOT, Meteor, Intear, MyNearWallet and more. No NEAR wallet yet? HOT and Meteor create one in a minute.</p>
                  </>
                ) : (
                  <ActionButton onClick={join} disabled={busy}>
                    {busy ? 'Confirm in your wallet…' : `Join as ${accountId}`}
                  </ActionButton>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.03] font-black tight">Add USDC to your account</h1>
              <p className="text-[16px] text-ink-2 mt-2 leading-snug">It moves from your wallet into your account in the vault. ParallaxPay trades from there, inside your rules. Withdraw whenever you like.</p>
              <Panel className="p-5 mt-6">
                <div className="rounded-[14px] border border-line px-4 py-3 focus-within:border-ink">
                  <div className="flex items-center gap-3">
                    <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className="num text-[30px] font-semibold w-full outline-none bg-transparent" />
                    <span className="label text-ink-3">USDC</span>
                  </div>
                  {wallet != null && (
                    <button onClick={() => setAmount(String(wallet))} className="text-[12.5px] text-ink-3 underline decoration-line underline-offset-2">
                      In your wallet: {qty(wallet)} USDC
                    </button>
                  )}
                </div>
                <ActionButton className="mt-4" onClick={fund} disabled={busy || !(n > 0) || (wallet != null && n > wallet)}>
                  {busy ? 'Confirm in your wallet…' : n > 0 ? `Add ${money(n)}` : 'Add USDC'}
                </ActionButton>
                {wallet === 0 && <p className="text-[13.5px] text-ink-2 mt-3 leading-snug">No USDC on NEAR in this wallet yet. Bring some over from another chain first; it takes about a minute.</p>}
              </Panel>
              <div className="flex justify-between mt-4 text-[13.5px]">
                <Link href="/fund" className="text-ink-3 underline decoration-line underline-offset-2 hover:decoration-ink">
                  Bring USDC from another chain
                </Link>
                <Link href="/desk" className="text-ink-3 underline decoration-line underline-offset-2 hover:decoration-ink">
                  Later
                </Link>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="text-center pt-6">
              <div className="mx-auto w-fit">
                <Avatar actor="parallaxpay" size={72} />
              </div>
              <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.03] font-black tight mt-6">ParallaxPay is working for you</h1>
              <p className="text-[16px] text-ink-2 mt-3 leading-snug max-w-[480px] mx-auto">
                {desk?.member?.rules.autopilot ? 'It trades on its own inside your rules and seals every plan on NEAR first.' : 'When a setup fits your rules, it seals the plan on NEAR and asks you on your desk.'} It reads the market every 15 minutes.
              </p>
              <div className="max-w-[360px] mx-auto mt-8 grid gap-2.5">
                <ActionButton onClick={() => router.push('/desk')}>Open your desk</ActionButton>
                <ActionButton href="/" tone="white">
                  Watch the floor
                </ActionButton>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
