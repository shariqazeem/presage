'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { IconCheck } from '../icons'
import { Sheet } from '../kit'
import { cx } from '../ui'
import { GAS_KEEP, MIN_TO_WORK, putToWork, workable, type Progress, type SetupStep } from '@/lib/near/deviceSetup'
import { fromUnits } from '@/lib/near/units'
import type { Rules } from '@/lib/near/vault'
import { TxLink } from './kit'
import { useNear } from './NearWallet'
import { sayError, tellAgent } from './sheets'

/**
 * The built-in account's own screens: where to send NEAR, the account putting it to work step by step,
 * and backing up or restoring its key.
 */

const STEP_LABEL: Record<SetupStep, string> = {
  register: 'Ready to receive USDC',
  wrap: 'Kept 0.45 NEAR for gas, the rest ready to swap',
  swap: 'Swapped to USDC on Rhea',
  join: 'Mandate signed into the vault',
  deposit: 'USDC moved into your vault account',
}
const ORDER: SetupStep[] = ['register', 'wrap', 'swap', 'join', 'deposit']

const near = (y: bigint, dp = 2) => `${fromUnits(y, 24).toFixed(dp)} NEAR`

/** Fund the built-in account with NEAR, then put it to work in one tap. */
export function DeviceFund({ rules, onDone }: { rules: Rules; onDone: (usdc: number) => void }) {
  const { accountId, deviceSecret } = useNear()
  const [backup, setBackup] = useState(false)
  const [balance, setBalance] = useState<{ balance: bigint; toWork: bigint } | null>(null)
  const [progress, setProgress] = useState<Partial<Record<SetupStep, Progress>>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!accountId || busy) return
    let alive = true
    const load = () => workable(accountId).then(b => alive && setBalance(b)).catch(() => {})
    void load()
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [accountId, busy])

  if (!accountId) return null
  const go = async () => {
    const secret = deviceSecret()
    if (!secret) return
    setBusy(true)
    setProgress({})
    try {
      const usdc = await putToWork(secret, accountId, rules, p => setProgress(prev => ({ ...prev, [p.step]: p })))
      await tellAgent(accountId)
      toast.success(`$${usdc.toFixed(2)} is in your vault account. I'm on it.`)
      onDone(usdc)
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }

  const arrived = balance != null && balance.balance > 0n
  const ready = balance != null && balance.toWork >= MIN_TO_WORK
  const started = Object.keys(progress).length > 0

  return (
    <div>
      <div className="rounded-[22px] bg-ink text-white p-5 relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">Your ParallaxPay account</div>
        <button onClick={() => navigator.clipboard?.writeText(accountId).then(() => toast.success('Address copied'))} className="mt-2 w-full text-left rounded-[14px] bg-white/[0.07] px-4 py-3 press">
          <span className="num text-[13.5px] break-all leading-snug">{accountId}</span>
          <span className="block text-[11.5px] font-semibold text-[#8A8A92] mt-1.5">Tap to copy · send NEAR here from any exchange or NEAR wallet</span>
        </button>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] text-[#8A8A92]">{arrived ? 'In the account' : 'Waiting for NEAR'}</div>
            <div className="num text-[24px] font-semibold">{balance ? near(balance.balance) : '…'}</div>
          </div>
          {!arrived && <span className="w-2.5 h-2.5 rounded-full bg-white animate-[soft-pulse_1.6s_ease-in-out_infinite]" aria-hidden />}
          {arrived && (
            <div className="text-right">
              <div className="text-[12px] text-[#8A8A92]">To put to work</div>
              <div className="num text-[16px] text-[#C9C9CF]">{balance ? near(balance.toWork) : '…'}</div>
            </div>
          )}
        </div>
        <p className="mt-3 text-[12.5px] text-[#8A8A92] leading-snug">Send at least 1 NEAR; 3 or more gives it room to work. It keeps {near(GAS_KEEP)} for gas and puts the rest to work. Its key lives only in this browser.</p>
      </div>

      {started && (
        <div className="mt-4 grid gap-2.5">
          {ORDER.filter(s => progress[s]).map(s => {
            const p = progress[s]!
            return (
              <div key={s} className="flex items-center gap-3">
                <span className={cx('w-6 h-6 rounded-full grid place-items-center shrink-0', p.state === 'done' ? 'bg-ink text-white' : 'border-2 border-ink/20 animate-pulse')}>{p.state === 'done' && <IconCheck size={12} weight={3} />}</span>
                <span className="text-[14px] flex-1">
                  {STEP_LABEL[s]}
                  {p.detail && <span className="num text-ink-3"> · {p.detail}</span>}
                </span>
                {p.tx && (
                  <TxLink hash={p.tx} className="text-[12px] text-ink-3">
                    tx
                  </TxLink>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button onClick={go} disabled={busy || !ready} className="mt-5 w-full h-[56px] rounded-[18px] bg-ink text-white font-semibold text-[16px] press disabled:opacity-40">
        {busy ? 'Putting it to work…' : ready ? `Put ${near(balance!.toWork)} to work` : arrived ? 'Send a little more NEAR' : 'Waiting for NEAR…'}
      </button>
      <button onClick={() => setBackup(b => !b)} className="mt-2 w-full h-11 rounded-[14px] text-[14px] font-semibold text-ink-2 press">
        {backup ? 'Hide the key' : 'Back up this account’s key'}
      </button>
      {backup && (
        <div className="mt-2 rounded-[18px] border border-line p-4">
          <BackupPanel />
        </div>
      )}
    </div>
  )
}

/** The built-in account's key, to keep somewhere safe or import into any NEAR wallet. */
export function BackupPanel({ onForgotten }: { onForgotten?: () => void }) {
  const { accountId, deviceSecret, forgetDevice } = useNear()
  const [shown, setShown] = useState(false)
  const [forget, setForget] = useState(false)
  const secret = deviceSecret()
  const download = () => {
    if (!secret || !accountId) return
    const text = `ParallaxPay account on NEAR\n\nAccount: ${accountId}\nKey: ${secret}\n\nAnyone with this key controls the account. Import it into any NEAR wallet (Meteor, MyNearWallet, HOT) or restore it on parallaxpay.\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `parallaxpay-account-${accountId.slice(0, 8)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div>
      <p className="text-[14px] text-ink-2 leading-snug">This key is the only way into your ParallaxPay account. It lives in this browser; if the browser&rsquo;s data is cleared, the key is gone. Keep a copy somewhere safe, or import it into any NEAR wallet.</p>
      <div className="mt-4 rounded-[16px] border border-line p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Account</div>
        <div className="num text-[12.5px] break-all mt-1">{accountId}</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 mt-3">Key</div>
        {shown ? <div className="num text-[12.5px] break-all mt-1 select-all">{secret}</div> : <div className="num text-[12.5px] mt-1 text-ink-3">ed25519:••••••••••••••••••••••••</div>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => (shown ? navigator.clipboard?.writeText(secret ?? '').then(() => toast.success('Key copied')) : setShown(true))} className="h-12 rounded-[14px] bg-ink text-white text-[14px] font-semibold press">
          {shown ? 'Copy key' : 'Show key'}
        </button>
        <button onClick={download} className="h-12 rounded-[14px] bg-paper-2 text-[14px] font-semibold press">
          Download
        </button>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        {!forget ? (
          <button onClick={() => setForget(true)} className="text-[13.5px] text-ink-3 underline decoration-line underline-offset-2">
            Remove this account from this browser
          </button>
        ) : (
          <div className="rounded-[14px] bg-paper-2 p-4">
            <p className="text-[13.5px] text-ink-2 leading-snug">Only do this once the key is backed up. Without it, nobody can open this account again.</p>
            <button
              onClick={() => {
                forgetDevice()
                onForgotten?.()
                toast.success('Removed from this browser.')
              }}
              className="mt-3 h-11 px-4 rounded-[12px] bg-down text-white text-[14px] font-semibold press"
            >
              I&rsquo;ve backed it up, remove it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The backup as a sheet, from the account menu or your agent's page. */
export function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Back up your account">
      {open && <BackupPanel onForgotten={onClose} />}
    </Sheet>
  )
}

/** Opens a built-in account on this browser from its backed-up key. */
export function RestoreSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { importDevice } = useNear()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const id = await importDevice(value)
      toast.success(`Opened ${id.slice(0, 4)}…${id.slice(-4)} on this browser.`)
      setValue('')
      onDone?.()
      onClose()
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Open your ParallaxPay account">
      <p className="text-[14px] text-ink-2 leading-snug -mt-1">Paste the key you backed up. It stays in this browser and is never sent anywhere.</p>
      <textarea value={value} onChange={e => setValue(e.target.value)} placeholder="ed25519:…" rows={3} className="mt-4 w-full rounded-[14px] border border-line px-4 py-3 num text-[13px] outline-none focus:border-ink resize-none" />
      <button onClick={go} disabled={busy || value.trim().length < 20} className="mt-4 w-full h-12 rounded-[14px] bg-ink text-white font-semibold press disabled:opacity-40">
        {busy ? 'Opening…' : 'Open it here'}
      </button>
    </Sheet>
  )
}
