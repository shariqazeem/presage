'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ActionButton, Eyebrow, Panel } from '@/components/kit'
import { NearButton, Verified, money, qty } from '@/components/near/kit'
import { useNear } from '@/components/near/NearWallet'
import { FundSheet } from '@/components/near/sheets'
import { cx } from '@/components/ui'
import { useDesk } from '@/lib/near/hooks'
import type { IntentQuote, IntentStatus, Origin } from '@/lib/near/intents'
import { toUnits } from '@/lib/near/units'

type OriginWithPrice = Origin & { price: number | null }

const STEPS: { key: IntentStatus['status'][]; label: string }[] = [
  { key: ['PENDING_DEPOSIT'], label: 'Waiting for your deposit' },
  { key: ['KNOWN_DEPOSIT_TX'], label: 'Deposit seen on its chain' },
  { key: ['PROCESSING'], label: 'Solvers are swapping it to USDC on NEAR' },
  { key: ['SUCCESS'], label: 'USDC delivered to your NEAR account' },
]

/** Bring funds to NEAR from another chain with NEAR Intents, then add them to ParallaxPay. */
export default function Fund() {
  const { accountId } = useNear()
  const { data: desk, refetch } = useDesk(accountId)
  const [origins, setOrigins] = useState<OriginWithPrice[]>([])
  const [pick, setPick] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [refundTo, setRefundTo] = useState('')
  const [preview, setPreview] = useState<IntentQuote['quote'] | null>(null)
  const [deposit, setDeposit] = useState<IntentQuote['quote'] | null>(null)
  const [status, setStatus] = useState<IntentStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [fund, setFund] = useState(false)

  useEffect(() => {
    fetch('/api/near/intents/tokens')
      .then(r => r.json())
      .then((d: { origins: OriginWithPrice[] }) => {
        setOrigins(d.origins)
        setPick(p => p || d.origins[0]?.assetId || '')
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (accountId && !recipient) setRecipient(accountId)
  }, [accountId, recipient])

  const origin = origins.find(o => o.assetId === pick)
  const units = useMemo(() => {
    try {
      return origin && Number(amount) > 0 ? toUnits(amount, origin.decimals) : 0n
    } catch {
      return 0n
    }
  }, [amount, origin])

  // A live preview as the amount changes, without making a deposit address.
  useEffect(() => {
    setPreview(null)
    if (!origin || units === 0n || !recipient || deposit) return
    const t = setTimeout(async () => {
      const r = await fetch('/api/near/intents/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originAsset: origin.assetId, amount: units.toString(), recipient, dry: true }) })
      const body = (await r.json()) as IntentQuote & { error?: string }
      if (r.ok) setPreview(body.quote)
    }, 450)
    return () => clearTimeout(t)
  }, [origin, units, recipient, deposit])

  // Once there's a deposit address, follow it until the USDC lands.
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
          toast.success('USDC arrived in your NEAR account.')
          void refetch()
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
  }, [deposit, refetch])

  const getAddress = async () => {
    if (!origin) return
    setBusy(true)
    const r = await fetch('/api/near/intents/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originAsset: origin.assetId, amount: units.toString(), recipient, refundTo: refundTo.trim(), dry: false }) })
    const body = (await r.json()) as IntentQuote & { error?: string }
    setBusy(false)
    if (!r.ok || !body.quote?.depositAddress) return toast.error(body.error ?? 'NEAR Intents could not quote that. Try a different amount.')
    setDeposit(body.quote)
  }

  const step = status ? STEPS.findIndex(s => s.key.includes(status.status)) : deposit ? 0 : -1
  return (
    <div className="max-w-[720px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
      <Eyebrow>NEAR Intents</Eyebrow>
      <h1 className="font-heading text-[34px] md:text-[44px] leading-[1.05] font-black tight mt-2">Bring funds to NEAR from any chain</h1>
      <p className="text-[16px] text-ink-2 mt-3 leading-snug">
        Send a coin from the chain it's on. NEAR Intents solvers swap it into USDC on NEAR and deliver it to your NEAR account. ParallaxPay never holds it on the way.
      </p>

      {!deposit ? (
        <Panel className="p-5 md:p-6 mt-6">
          <div className="label text-ink-3">You send</div>
          <div className="flex flex-wrap gap-2 mt-2 min-h-[88px] content-start">
            {!origins.length && Array.from({ length: 8 }, (_, i) => <span key={i} className="h-10 w-28 rounded-full bg-paper-2 animate-pulse" />)}
            {origins.map(o => (
              <button key={o.assetId} onClick={() => setPick(o.assetId)} className={cx('h-10 px-3.5 rounded-full border text-[13.5px] font-semibold', pick === o.assetId ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-3')}>
                {o.symbol} <span className={pick === o.assetId ? 'text-white/60' : 'text-ink-3'}>· {o.chain}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[14px] border border-line px-4 py-3 focus-within:border-ink">
            <div className="flex items-center gap-3">
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className="num text-[28px] font-semibold w-full outline-none bg-transparent" />
              <span className="label text-ink-3">{origin?.symbol}</span>
            </div>
            {origin?.price != null && Number(amount) > 0 && <div className="text-[12.5px] text-ink-3 num">≈ {money(Number(amount) * origin.price)}</div>}
          </div>

          <div className="label text-ink-3 mt-5">You get, on NEAR</div>
          <div className="mt-2 rounded-[14px] bg-paper-2 px-4 py-3 flex items-center justify-between">
            <span className="num text-[24px] font-semibold">{preview ? qty(Number(preview.amountOutFormatted)) : '—'}</span>
            <span className="label text-ink-3">USDC</span>
          </div>
          {preview && (
            <div className="text-[12.5px] text-ink-3 mt-1.5">
              At least {qty(Number(preview.minAmountOut) / 1e6)} USDC, in about {preview.timeEstimate < 120 ? `${preview.timeEstimate} seconds` : `${Math.round(preview.timeEstimate / 60)} minutes`}.
            </div>
          )}

          <label className="block mt-5">
            <span className="label text-ink-3">To this NEAR account</span>
            <input value={recipient} onChange={e => setRecipient(e.target.value.trim().toLowerCase())} placeholder="you.near" className="mt-2 w-full h-12 rounded-[12px] border border-line px-4 num text-[15px] outline-none focus:border-ink" />
          </label>
          {!accountId && (
            <div className="mt-2">
              <NearButton label="Or connect a NEAR wallet" />
            </div>
          )}
          <label className="block mt-4">
            <span className="label text-ink-3">Refunds go back to (your {origin?.chain} address)</span>
            <input value={refundTo} onChange={e => setRefundTo(e.target.value)} placeholder={origin?.chain === 'Solana' ? 'Your Solana address' : origin?.chain === 'Bitcoin' ? 'bc1…' : origin?.chain === 'Tron' ? 'T…' : '0x…'} className="mt-2 w-full h-12 rounded-[12px] border border-line px-4 num text-[14px] outline-none focus:border-ink" />
          </label>
          <ActionButton className="mt-5" onClick={getAddress} disabled={busy || !preview || refundTo.trim().length < 20}>
            {busy ? 'Asking NEAR Intents…' : 'Get my deposit address'}
          </ActionButton>
        </Panel>
      ) : (
        <Panel tone="ticket" className="p-5 md:p-6 mt-6">
          <div className="label !text-[10px] text-[#8A8A92]">Send exactly</div>
          <div className="num text-[34px] font-semibold text-white mt-1">
            {deposit.amountInFormatted} {origin?.symbol}
          </div>
          <div className="text-[13px] text-[#8A8A92]">on {origin?.chain}, to this one-time address:</div>
          <button onClick={() => navigator.clipboard?.writeText(deposit.depositAddress!).then(() => toast.success('Copied'))} className="mt-3 w-full text-left rounded-[12px] bg-white/[0.07] px-4 py-3 num text-[14px] text-white break-all">
            {deposit.depositAddress}
            <span className="block label !text-[9.5px] text-[#8A8A92] mt-1">Tap to copy</span>
          </button>
          {deposit.depositMemo && <div className="mt-2 text-[13px] text-white">Memo: <span className="num">{deposit.depositMemo}</span></div>}
          <div className="text-[13px] text-[#C9C9CF] mt-3">
            {recipient} receives at least {qty(Number(deposit.minAmountOut) / 1e6)} USDC. If anything goes wrong, it goes back to your {origin?.chain} address.
          </div>
          <div className="perf my-5" style={{ ['--notch' as string]: '#fff' }} />
          <div className="grid gap-3">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className={cx('w-5 h-5 rounded-full grid place-items-center text-[11px] num', i < step || status?.status === 'SUCCESS' ? 'bg-up-d text-ink' : i === step ? 'bg-white text-ink animate-pulse' : 'bg-white/10 text-[#8A8A92]')}>{i + 1}</span>
                <span className={cx('text-[14px]', i <= step ? 'text-white' : 'text-[#8A8A92]')}>{s.label}</span>
              </div>
            ))}
            {(status?.status === 'REFUNDED' || status?.status === 'FAILED' || status?.status === 'INCOMPLETE_DEPOSIT') && (
              <div className="text-[14px] text-down-d">
                {status.status === 'INCOMPLETE_DEPOSIT' ? 'The deposit was less than quoted; NEAR Intents will refund it.' : `This swap was ${status.status.toLowerCase()}. Funds return to your ${origin?.chain} address.`}
              </div>
            )}
          </div>
        </Panel>
      )}

      {status?.status === 'SUCCESS' && (
        <Panel className="p-5 mt-4">
          <Verified ok>{status.swapDetails?.amountOutFormatted ?? ''} USDC is in {recipient}.</Verified>
          {accountId === recipient && desk?.member ? (
            <ActionButton className="mt-4" onClick={() => setFund(true)}>
              Add it to ParallaxPay
            </ActionButton>
          ) : (
            <ActionButton className="mt-4" href="/start">
              Set up your agent
            </ActionButton>
          )}
        </Panel>
      )}

      <p className="text-[13px] text-ink-3 mt-6 leading-snug">
        Quotes and delivery come from NEAR Intents' 1-Click service and its solvers. Check a swap any time on the{' '}
        <a href="https://explorer.near-intents.org" target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">NEAR Intents explorer</a>. Already have USDC on NEAR? <Link href="/" className="underline decoration-line underline-offset-2">Go to your desk</Link>.
      </p>
      <FundSheet open={fund} onClose={() => setFund(false)} onDone={() => void refetch()} />
    </div>
  )
}
