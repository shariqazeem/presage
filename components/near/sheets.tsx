'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ActionButton, Sheet } from '../kit'
import { cx } from '../ui'
import { COINS, USDC, USDC_ID, tokenById } from '@/lib/near/config'
import { ftBalance, storageRegistered } from '@/lib/near/rpc'
import { depositTx, registerTx, setRulesTx, withdrawTx, type WalletTx } from '@/lib/near/tx'
import { fromUnits, toUnits } from '@/lib/near/units'
import type { Member, Rules } from '@/lib/near/vault'
import { money, qty } from './kit'
import { useNear } from './NearWallet'
import { RulesForm } from './RulesForm'

const sayError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  toast.error(/reject|cancel|denied|closed/i.test(m) ? 'Cancelled in the wallet.' : m.slice(0, 140))
}

/** Lets the agent re-read this member from NEAR; with a transaction, its deposit or withdrawal shows on the floor. */
export async function tellAgent(account: string, txHash?: string | null) {
  await fetch('/api/near/hello', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, txHash: txHash ?? undefined }) }).catch(() => {})
}

function AmountInput({ value, onChange, max, symbol }: { value: string; onChange: (v: string) => void; max: number | null; symbol: string }) {
  return (
    <div className="rounded-[14px] border border-line px-4 py-3 focus-within:border-ink">
      <div className="flex items-center gap-3">
        <input inputMode="decimal" value={value} onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className="num text-[28px] font-semibold w-full outline-none bg-transparent" />
        <span className="label text-ink-3">{symbol}</span>
      </div>
      {max != null && (
        <button type="button" onClick={() => onChange(String(max))} className="mt-1 text-[12.5px] text-ink-3 underline decoration-line underline-offset-2 hover:decoration-ink">
          Max: {qty(max)} {symbol}
        </button>
      )}
    </div>
  )
}

/** Add USDC from the connected wallet to the member's vault account. */
export function FundSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { accountId, send } = useNear()
  const [wallet, setWallet] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open || !accountId) return
    ftBalance(USDC_ID, accountId)
      .then(b => setWallet(fromUnits(b, USDC.decimals)))
      .catch(() => setWallet(0))
  }, [open, accountId])
  const n = Number(amount)
  const go = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const [hash] = await send([depositTx(toUnits(amount, USDC.decimals))])
      toast.success(`Added ${money(n)} to your ParallaxPay account.`)
      await tellAgent(accountId, hash)
      setAmount('')
      onDone()
      onClose()
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add funds">
      <p className="text-[14px] text-ink-2 leading-snug">USDC moves from your wallet into your account in the ParallaxPay vault. You can withdraw it whenever you like.</p>
      <div className="mt-4">
        <AmountInput value={amount} onChange={setAmount} max={wallet} symbol="USDC" />
      </div>
      {wallet === 0 && (
        <p className="mt-3 text-[13.5px] text-ink-2 leading-snug">
          No USDC on NEAR in this wallet yet. Bring some from another chain with <span className="font-semibold">NEAR Intents</span> (below), or from an exchange that sends USDC on NEAR.
        </p>
      )}
      <ActionButton className="mt-5" onClick={go} disabled={busy || !(n > 0) || (wallet != null && n > wallet)}>
        {busy ? 'Confirm in your wallet…' : `Add ${n > 0 ? money(n) : 'funds'}`}
      </ActionButton>
      <a href="#intents" onClick={onClose} className="block text-center mt-3 text-[13.5px] text-ink-3 underline decoration-line underline-offset-2 hover:decoration-ink">
        Coming from another chain?
      </a>
    </Sheet>
  )
}

/** Withdraw any token from the vault to the member's own wallet. */
export function WithdrawSheet({ open, onClose, member, onDone }: { open: boolean; onClose: () => void; member: Member; onDone: () => void }) {
  const { accountId, send } = useNear()
  const held = Object.entries(member.balances).filter(([, v]) => BigInt(v) > 0n)
  const [token, setToken] = useState(held[0]?.[0] ?? USDC_ID)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const t = tokenById(token)
  const max = t ? fromUnits(member.balances[token] ?? '0', t.decimals) : 0
  const go = async () => {
    if (!accountId || !t) return
    setBusy(true)
    try {
      const all = Number(amount) >= max
      const txs: WalletTx[] = []
      // A token the wallet has never held needs registering before it can receive it.
      if (!(await storageRegistered(token, accountId).catch(() => true))) txs.push(registerTx(token, accountId))
      txs.push(withdrawTx(token, all ? undefined : toUnits(amount, t.decimals)))
      const hashes = await send(txs)
      toast.success(`Withdrew ${qty(all ? max : Number(amount))} ${t.symbol} to ${accountId}.`)
      await tellAgent(accountId, hashes.at(-1))
      setAmount('')
      onDone()
      onClose()
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Withdraw">
      {held.length === 0 ? (
        <p className="text-[14px] text-ink-2">Nothing in your account to withdraw.</p>
      ) : (
        <>
          <div className="flex gap-2">
            {held.map(([id]) => (
              <button key={id} onClick={() => setToken(id)} className={cx('px-4 h-10 rounded-full border text-[14px] font-semibold', token === id ? 'bg-ink text-white border-ink' : 'border-line')}>
                {tokenById(id)?.symbol ?? id}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <AmountInput value={amount} onChange={setAmount} max={max} symbol={t?.symbol ?? ''} />
          </div>
          <p className="mt-3 text-[13px] text-ink-3 leading-snug">It goes to {accountId} and nowhere else. If the agent holds this coin in an open trade, that trade ends with what's left.</p>
          <ActionButton className="mt-5" onClick={go} disabled={busy || !(Number(amount) > 0) || Number(amount) > max}>
            {busy ? 'Confirm in your wallet…' : 'Withdraw'}
          </ActionButton>
        </>
      )}
    </Sheet>
  )
}

/** Change rules. Signed by the member's wallet, stored in the vault. */
export function RulesSheet({ open, onClose, current, onDone }: { open: boolean; onClose: () => void; current: Rules; onDone: () => void }) {
  const { accountId, send } = useNear()
  const [rules, setRules] = useState<Rules>(current)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setRules(current)
  }, [open, current])
  const valid = !rules.autopilot || rules.coins.length > 0
  const go = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      await send([setRulesTx(rules)])
      toast.success('Your rules are saved on NEAR.')
      await tellAgent(accountId)
      onDone()
      onClose()
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Your rules">
      <RulesForm rules={rules} onChange={setRules} />
      <ActionButton className="mt-4" onClick={go} disabled={busy || !valid}>
        {busy ? 'Confirm in your wallet…' : 'Save rules'}
      </ActionButton>
    </Sheet>
  )
}

export const COIN_SYMBOLS = Object.fromEntries([[USDC_ID, 'USDC'], ...COINS.map(c => [c.id, c.symbol])])
export { sayError }
