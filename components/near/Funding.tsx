'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { cx } from '../ui'
import { USDC, USDC_ID } from '@/lib/near/config'
import type { IntentQuote, IntentStatus, Origin } from '@/lib/near/intents'
import { ftBalance } from '@/lib/near/rpc'
import { depositTx, joinTx, type WalletTx } from '@/lib/near/tx'
import { fromUnits, toUnits } from '@/lib/near/units'
import type { Member, Rules } from '@/lib/near/vault'
import { NearButton, money, qty, usd } from './kit'
import { useNear } from './NearWallet'
import { sayError, tellAgent } from './sheets'

/**
 * Funding, in one place: from the NEAR wallet you connected, or from any chain through NEAR Intents.
 * Someone who hasn't joined yet signs their mandate and adds funds in a single confirmation.
 */

type OriginWithPrice = Origin & { price: number | null }

const STATUS_STEPS: { key: IntentStatus['status'][]; label: string }[] = [
  { key: ['PENDING_DEPOSIT'], label: 'Waiting for your deposit' },
  { key: ['KNOWN_DEPOSIT_TX'], label: 'Deposit seen on its chain' },
  { key: ['PROCESSING'], label: 'Swapping it to USDC on NEAR' },
  { key: ['SUCCESS'], label: 'USDC is in your NEAR account' },
]

const refundHint = (chain: string | undefined) => (chain === 'Solana' ? 'Your Solana address' : chain === 'Bitcoin' ? 'bc1…' : chain === 'Tron' ? 'T…' : '0x…')

/** Bring funds from another chain: a one-time deposit address from NEAR Intents, followed until the USDC lands. */
export function IntentsFund({ recipient, onRecipient, onArrived }: { recipient: string; onRecipient?: (v: string) => void; onArrived?: (usdc: number) => void }) {
  const [origins, setOrigins] = useState<OriginWithPrice[]>([])
  const [pick, setPick] = useState('')
  const [amount, setAmount] = useState('')
  const [refundTo, setRefundTo] = useState('')
  const [preview, setPreview] = useState<IntentQuote['quote'] | null>(null)
  const [deposit, setDeposit] = useState<IntentQuote['quote'] | null>(null)
  const [status, setStatus] = useState<IntentStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/near/intents/tokens')
      .then(r => r.json())
      .then((d: { origins: OriginWithPrice[] }) => {
        setOrigins(d.origins)
        setPick(p => p || d.origins[0]?.assetId || '')
      })
      .catch(() => {})
  }, [])

  const origin = origins.find(o => o.assetId === pick)
  const units = useMemo(() => {
    try {
      return origin && Number(amount) > 0 ? toUnits(amount, origin.decimals) : 0n
    } catch {
      return 0n
    }
  }, [amount, origin])

  // A live price as the amount changes, without making a deposit address yet.
  useEffect(() => {
    setPreview(null)
    if (!origin || units === 0n || !recipient || deposit) return
    const t = setTimeout(async () => {
      const r = await fetch('/api/near/intents/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originAsset: origin.assetId, amount: units.toString(), recipient, dry: true }) }).catch(() => null)
      const body = (await r?.json().catch(() => null)) as (IntentQuote & { error?: string }) | null
      if (r?.ok && body) setPreview(body.quote)
    }, 450)
    return () => clearTimeout(t)
  }, [origin, units, recipient, deposit])

  // Once there's an address, follow the swap until the USDC lands.
  useEffect(() => {
    if (!deposit?.depositAddress) return
    let stop = false
    const poll = async () => {
      const q = new URLSearchParams({ depositAddress: deposit.depositAddress!, ...(deposit.depositMemo ? { depositMemo: deposit.depositMemo } : {}) })
      const r = await fetch(`/api/near/intents/status?${q}`).catch(() => null)
      if (r?.ok) {
        const s = (await r.json()) as IntentStatus
        if (!stop) setStatus(s)
        if (s.status === 'SUCCESS') {
          const got = Number(s.swapDetails?.amountOutFormatted ?? deposit.amountOutFormatted)
          toast.success(`${qty(got)} USDC arrived in ${recipient}.`)
          onArrived?.(got)
          return
        }
        if (s.status === 'REFUNDED' || s.status === 'FAILED') return
      }
      if (!stop) setTimeout(poll, 5000)
    }
    void poll()
    return () => {
      stop = true
    }
  }, [deposit, recipient, onArrived])

  const getAddress = async () => {
    if (!origin) return
    setBusy(true)
    const r = await fetch('/api/near/intents/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originAsset: origin.assetId, amount: units.toString(), recipient, refundTo: refundTo.trim(), dry: false }) }).catch(() => null)
    const body = (await r?.json().catch(() => null)) as (IntentQuote & { error?: string }) | null
    setBusy(false)
    if (!r?.ok || !body?.quote?.depositAddress) return toast.error(body?.error ?? 'NEAR Intents could not quote that. Try a different amount.')
    setDeposit(body.quote)
  }

  if (deposit) {
    const at = status ? STATUS_STEPS.findIndex(s => s.key.includes(status.status)) : 0
    const failed = status?.status === 'REFUNDED' || status?.status === 'FAILED' || status?.status === 'INCOMPLETE_DEPOSIT'
    return (
      <div className="rounded-[22px] bg-ink text-white p-5 relative overflow-hidden">
        <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">Send exactly</div>
        <div className="num text-[30px] font-semibold mt-1">
          {deposit.amountInFormatted} {origin?.symbol}
        </div>
        <div className="text-[13px] text-[#8A8A92]">on {origin?.chain}, to this one-time address</div>
        <button onClick={() => navigator.clipboard?.writeText(deposit.depositAddress!).then(() => toast.success('Address copied'))} className="mt-3 w-full text-left rounded-[14px] bg-white/[0.07] px-4 py-3 num text-[13.5px] break-all press">
          {deposit.depositAddress}
          <span className="block text-[11px] font-sans font-semibold text-[#8A8A92] mt-1">Tap to copy</span>
        </button>
        {deposit.depositMemo && (
          <div className="mt-2 text-[13px]">
            Memo: <span className="num">{deposit.depositMemo}</span>
          </div>
        )}
        <div className="grid gap-2.5 mt-5">
          {STATUS_STEPS.map((s, i) => {
            const done = i < at || status?.status === 'SUCCESS'
            return (
              <div key={s.label} className="flex items-center gap-3">
                <span className={cx('w-5 h-5 rounded-full grid place-items-center text-[11px] num shrink-0', done ? 'bg-up-d text-ink' : i === at && !failed ? 'bg-white text-ink animate-pulse' : 'bg-white/10 text-[#8A8A92]')}>{i + 1}</span>
                <span className={cx('text-[14px]', i <= at ? 'text-white' : 'text-[#8A8A92]')}>{s.label}</span>
              </div>
            )
          })}
        </div>
        {failed && <p className="mt-4 text-[13.5px] text-down-d leading-snug">{status?.status === 'INCOMPLETE_DEPOSIT' ? 'The deposit was less than quoted, so NEAR Intents is refunding it.' : `The swap was ${status?.status.toLowerCase()}. Your funds go back to your ${origin?.chain} address.`}</p>}
        <p className="mt-4 text-[12.5px] text-[#8A8A92] leading-snug">
          At least {qty(Number(deposit.minAmountOut) / 10 ** USDC.decimals)} USDC lands in {recipient}. Anything that fails goes back to your {origin?.chain} address.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 min-h-[44px]">
        {!origins.length && Array.from({ length: 6 }, (_, i) => <span key={i} className="h-10 w-24 rounded-full bg-paper-2 animate-pulse" />)}
        {origins.map(o => (
          <button key={o.assetId} onClick={() => setPick(o.assetId)} className={cx('h-10 px-3.5 rounded-full border text-[13.5px] font-semibold press', pick === o.assetId ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-3')}>
            {o.symbol} <span className={pick === o.assetId ? 'text-white/60' : 'text-ink-3'}>· {o.chain}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="rounded-[16px] border border-line px-4 py-3 focus-within:border-ink">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">You send</div>
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" aria-label={`Amount of ${origin?.symbol ?? 'coin'} to send`} className="num text-[24px] font-semibold w-full outline-none bg-transparent" />
          <div className="text-[12px] text-ink-3 num h-4">{origin?.price != null && Number(amount) > 0 ? `≈ ${money(Number(amount) * origin.price)}` : origin?.symbol}</div>
        </div>
        <span className="text-ink-3 text-[18px]" aria-hidden>
          →
        </span>
        <div className="rounded-[16px] bg-paper-2 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">You get</div>
          <div className="num text-[24px] font-semibold">{preview ? qty(Number(preview.amountOutFormatted)) : '—'}</div>
          <div className="text-[12px] text-ink-3 h-4">USDC on NEAR</div>
        </div>
      </div>
      {preview && <div className="text-[12.5px] text-ink-3 mt-2">In about {preview.timeEstimate < 120 ? `${preview.timeEstimate} seconds` : `${Math.round(preview.timeEstimate / 60)} minutes`}, through NEAR Intents.</div>}
      {onRecipient && (
        <label className="block mt-4">
          <span className="text-[12.5px] font-semibold text-ink-2">To this NEAR account</span>
          <input value={recipient} onChange={e => onRecipient(e.target.value.trim().toLowerCase())} placeholder="you.near" className="mt-1.5 w-full h-12 rounded-[14px] border border-line px-4 num text-[15px] outline-none focus:border-ink" />
        </label>
      )}
      <label className="block mt-4">
        <span className="text-[12.5px] font-semibold text-ink-2">If anything fails, refund to (your {origin?.chain ?? 'origin'} address)</span>
        <input value={refundTo} onChange={e => setRefundTo(e.target.value)} placeholder={refundHint(origin?.chain)} className="mt-1.5 w-full h-12 rounded-[14px] border border-line px-4 num text-[14px] outline-none focus:border-ink" />
      </label>
      <button onClick={getAddress} disabled={busy || !preview || refundTo.trim().length < 20} className="mt-5 w-full h-[54px] rounded-[16px] bg-ink text-white font-semibold text-[15.5px] press disabled:opacity-40">
        {busy ? 'Asking NEAR Intents…' : 'Get my deposit address'}
      </button>
    </div>
  )
}

/**
 * Funding the agent: sign the mandate (if it isn't signed yet) and add USDC in one confirmation, or bring
 * USDC over from another chain first. `rules` is the mandate to sign when there's no membership yet.
 */
export function FundFlow({ rules, member, vaultLive, onDone }: { rules: Rules; member: Member | null; vaultLive: boolean; onDone: (how: 'joined' | 'funded') => void }) {
  const { accountId, send } = useNear()
  const [tab, setTab] = useState<'wallet' | 'chain'>('wallet')
  const [wallet, setWallet] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!accountId) return setWallet(null)
    let alive = true
    const load = () =>
      ftBalance(USDC_ID, accountId)
        .then(b => alive && setWallet(fromUnits(b, USDC.decimals)))
        .catch(() => alive && setWallet(0))
    void load()
    const t = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [accountId])

  const n = Number(amount)
  const tooMuch = wallet != null && n > wallet
  const go = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const txs: WalletTx[] = []
      if (!member) txs.push(joinTx(rules))
      if (n > 0) txs.push(depositTx(toUnits(amount, USDC.decimals)))
      const hashes = await send(txs)
      await tellAgent(accountId, hashes.at(-1))
      toast.success(member ? `Added ${money(n)}. I can work with it now.` : n > 0 ? `Mandate signed and ${money(n)} added.` : 'Mandate signed on NEAR.')
      onDone(n > 0 ? 'funded' : 'joined')
    } catch (e) {
      sayError(e)
    }
    setBusy(false)
  }

  if (!vaultLive) return <p className="rounded-[18px] bg-paper-2 p-4 text-[14px] text-ink-2 leading-snug">The vault isn&rsquo;t answering right now, so funding is paused. Your mandate is saved on this device; try again in a minute.</p>

  return (
    <div>
      <div role="tablist" aria-label="Where the money comes from" className="grid grid-cols-2 gap-1 p-1 rounded-[16px] bg-paper-2">
        {(
          [
            ['wallet', 'My NEAR wallet'],
            ['chain', 'Another chain'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('h-10 rounded-[12px] text-[14px] font-semibold transition-colors press', tab === k ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-3')}>
            {label}
          </button>
        ))}
      </div>

      {!accountId ? (
        <div className="mt-5">
          <NearButton variant="full" label={tab === 'wallet' ? 'Connect a NEAR wallet' : 'Connect the NEAR wallet it should arrive in'} />
          <p className="text-[13px] text-ink-3 mt-3 text-center leading-snug">HOT, Meteor, MyNearWallet, OKX, or MetaMask through Ethereum wallets.</p>
        </div>
      ) : tab === 'chain' ? (
        <div className="mt-5">
          <IntentsFund
            recipient={accountId}
            onArrived={got => {
              setAmount(String(Math.floor(got * 100) / 100))
              setTab('wallet')
            }}
          />
        </div>
      ) : (
        <div className="mt-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="num text-[48px] font-semibold text-ink-3">$</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" aria-label="Amount of USDC to add" className="num text-[48px] font-semibold w-[200px] text-center outline-none bg-transparent placeholder:text-line" />
            </div>
            <div className={cx('text-[13.5px] mt-1', tooMuch ? 'text-down' : 'text-ink-3')}>{wallet == null ? 'Checking your wallet…' : `${qty(wallet)} USDC in ${accountId}`}</div>
          </div>
          {wallet != null && wallet > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0.25, 0.5, 1].map(f => (
                <button key={f} onClick={() => setAmount(String(Math.floor(wallet * f * 100) / 100))} className="h-11 rounded-[14px] bg-paper-2 text-[14px] font-semibold press">
                  {f === 1 ? 'Max' : `${f * 100}%`}
                </button>
              ))}
            </div>
          )}
          {wallet === 0 && (
            <button onClick={() => setTab('chain')} className="mt-4 w-full rounded-[18px] border border-line p-4 text-left press">
              <div className="font-semibold text-[15px]">No USDC on NEAR here yet</div>
              <div className="text-[13px] text-ink-3 mt-0.5">Bring it from Base, Ethereum, Solana, Arbitrum, Tron or Bitcoin in about a minute →</div>
            </button>
          )}
          <button onClick={go} disabled={busy || tooMuch || (member != null && !(n > 0))} className="mt-5 w-full h-[56px] rounded-[18px] bg-ink text-white font-semibold text-[16px] press disabled:opacity-40">
            {busy ? 'Confirm in your wallet…' : member ? `Add ${n > 0 ? usd(n) : 'USDC'}` : n > 0 ? `Sign my mandate and add ${usd(n)}` : 'Sign my mandate'}
          </button>
          {!member && <p className="text-[12.5px] text-ink-3 mt-3 text-center leading-snug">One confirmation writes your mandate into the vault on NEAR{n > 0 ? ' and moves the USDC into your account there' : ''}. Storage costs 0.02 NEAR, returned if you leave.</p>}
        </div>
      )}
    </div>
  )
}
