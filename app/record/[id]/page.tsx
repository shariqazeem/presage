'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { recoverMessageAddress } from 'viem'
import { useNow } from '@/components/kit'
import { IconCheck, IconChevron, IconLock, IconX } from '@/components/icons'
import { Avatar } from '@/components/near/agent'
import { AgentDrawing } from '@/components/near/AgentDrawing'
import { TxLink, Verified, pctText, qty, usd } from '@/components/near/kit'
import { Segmented } from '@/components/near/primitives'
import { cx } from '@/components/ui'
import { VAULT_ID, nearAccountUrl, nearTxUrl } from '@/lib/near/config'
import { px, tfForAge, type DrawTf } from '@/lib/near/drawing'
import { useAgentState, useTrade } from '@/lib/near/hooks'
import { previewDesk } from '@/lib/near/preview'
import type { PositionView } from '@/lib/near/store'
import { vault } from '@/lib/near/vault'

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)))

const OUTCOME: Record<string, string> = { open: 'Trading', closed: 'Kept', not_filled: 'Didn’t fill', declined: 'Not taken', proposed: 'Waiting for the member' }

const when = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** The promise, step by step: sealed on NEAR, bought, sold, opened on NEAR. */
function Timeline({ t, mounted }: { t: PositionView; mounted: boolean }) {
  const missed = t.status === 'not_filled' || t.status === 'declined'
  const steps = [
    { title: 'Sealed on NEAR', done: Boolean(t.txs.seal || t.callId != null), at: t.createdAt, tx: t.txs.seal, bad: false },
    { title: missed ? (t.status === 'declined' ? 'Not taken' : 'Didn’t fill') : 'Bought', done: Boolean(t.openedAt) || missed, at: t.openedAt, tx: t.txs.entry !== t.txs.seal ? t.txs.entry : null, bad: missed },
    { title: 'Sold', done: t.status === 'closed', at: t.closedAt, tx: t.txs.exit, bad: false },
    { title: 'Opened on NEAR', done: t.opened, at: null, tx: t.txs.reveal, bad: false },
  ]
  return (
    <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {steps.map((st, i) => (
        <li key={st.title} className={cx('rounded-[18px] p-3.5 md:p-4 border', st.done ? (st.bad ? 'border-down/30 bg-white' : 'border-line bg-white') : 'border-dashed border-[#D6D6D2]')}>
          <span className={cx('w-7 h-7 rounded-full grid place-items-center', st.done ? (st.bad ? 'bg-down text-white' : i === 0 || i === 3 ? 'foil text-white' : 'bg-ink text-white') : 'border border-line text-ink-3')}>
            {st.done ? st.bad ? <IconX size={12} weight={3} /> : <IconCheck size={12} weight={3.2} /> : <span className="num text-[11px] font-semibold">{i + 1}</span>}
          </span>
          <div className={cx('font-semibold text-[14px] mt-2.5 leading-tight', st.done ? 'text-ink' : 'text-ink-3')}>{st.title}</div>
          <div className="num text-[12px] text-ink-3 mt-0.5 min-h-[18px]">{st.done && mounted ? when(st.at) : !st.done ? 'not yet' : ''}</div>
          {st.tx && (
            <a href={nearTxUrl(st.tx)} target="_blank" rel="noreferrer" className="num text-[12px] text-ink-2 underline decoration-line underline-offset-2">
              {st.tx.slice(0, 8)}… ↗
            </a>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * One promise's receipt: the plan drawn on ParallaxPay's chart with where it bought and sold, the
 * promise step by step, the plan once opened with the analyst's signed review, the checks anyone can
 * repeat in their own browser, and the exact chart image it read when it sealed the plan.
 */
export default function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error } = useTrade(Number(id))
  const { data: agent } = useAgentState()
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    // Sample promises for checking the design locally (/record/9003?preview=1). Development builds only.
    if (process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('preview')) setPreview(true)
  }, [])
  const mock = preview ? (previewDesk(agent?.reads ?? []).positions.find(p => p.id === Number(id)) ?? null) : null
  const t = mock ?? data?.trade
  const now = useNow(60_000)
  const [hashOk, setHashOk] = useState<boolean | null>(null)
  const [chain, setChain] = useState<{ ok: boolean; block: string; at: number } | null>(null)
  const [sigOk, setSigOk] = useState<boolean | null>(null)
  const [shotOk, setShotOk] = useState(true)
  const [tf, setTf] = useState<DrawTf | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!t) return
    if (t.salt && t.planJson) {
      const sealed = new Uint8Array([...bytes(t.salt), ...new TextEncoder().encode(t.planJson)])
      crypto.subtle.digest('SHA-256', sealed).then(d => setHashOk(hex(d) === t.hash))
    }
    if (t.callId != null)
      vault
        .call(t.callId)
        .then(c => c && setChain({ ok: c.hash === t.hash, block: c.sealed_block, at: Number(BigInt(c.sealed_at) / 1_000_000_000n) }))
        .catch(() => {})
    const a = t.plan?.analyst
    if (a && a.provider === 'near-ai' && a.signature)
      recoverMessageAddress({ message: a.signature.text, signature: a.signature.signature as `0x${string}` })
        .then(addr => setSigOk(addr.toLowerCase() === a.signature!.signing_address.toLowerCase()))
        .catch(() => setSigOk(false))
  }, [t])

  if (error && !mock)
    return (
      <div className="max-w-[560px] mx-auto px-4 pt-16 pb-28 text-center">
        <h1 className="font-heading text-[26px] font-black tight">No promise with that number.</h1>
        <p className="text-[14.5px] text-ink-2 mt-2 leading-snug">Every plan ParallaxPay seals on NEAR is listed in its work, losses included.</p>
        <Link href="/record" className="mt-5 inline-flex h-11 px-5 rounded-full bg-ink text-white text-[14px] font-semibold items-center press">
          See its work
        </Link>
      </div>
    )
  if (!t)
    return (
      <div className="max-w-[1180px] mx-auto px-4 pt-10 grid lg:grid-cols-[0.85fr_1.15fr] gap-4">
        <div className="h-72 rounded-[24px] bg-paper-2 animate-pulse" />
        <div className="h-72 rounded-[24px] bg-ink/90 animate-pulse" />
      </div>
    )

  const won = t.pnlUsd != null && t.pnlUsd >= 0
  const analyst = t.plan?.analyst
  const at = t.plan?.issuedAt ?? t.createdAt
  const shownTf = tf ?? tfForAge(now - at)
  const plan = t.plan ? { entry: t.plan.entry.priceAtIssue, stop: t.plan.stop, target: t.plan.target, from: at } : t.stop || t.target ? { entry: t.entryPrice, stop: t.stop || null, target: t.target || null, from: t.openedAt ?? at } : null
  const markers = [
    ...(t.openedAt && t.entryPrice ? [{ at: t.openedAt, price: t.entryPrice, label: 'In', tone: 'in' as const }] : []),
    ...(t.closedAt && t.exitPrice && t.status === 'closed' ? [{ at: t.closedAt, price: t.exitPrice, label: 'Out', tone: 'out' as const }] : []),
  ]

  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-6 lg:px-8 pt-5 md:pt-8 pb-24 md:pb-16">
      <Link href="/record" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-ink-3 hover:text-ink">
        <IconChevron size={14} className="rotate-180" /> Its work
      </Link>

      <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-4 mt-3">
        {/* the ticket */}
        <div className="rounded-[24px] bg-ink text-white p-5 md:p-6 relative overflow-hidden flex flex-col">
          <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
          <div className="flex items-center gap-3">
            <Avatar actor="parallaxpay" size={36} />
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold">ParallaxPay · plan #{t.callId ?? '—'}</div>
              <div className="text-[12.5px] text-[#8A8A92]">
                {t.opened ? 'Opened on NEAR' : 'Sealed on NEAR'} · {OUTCOME[t.status] ?? t.status}
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 mt-6">
            <div>
              <div className="font-heading text-[48px] md:text-[56px] font-black tight leading-none">{t.coin}</div>
              <div className="num text-[14px] text-[#C9C9CF] mt-2.5">
                {usd(t.usdcIn, { trim: true })}
                {t.entryPrice ? ` in at ${px(t.entryPrice)}` : ''}
                {t.exitPrice ? ` → out at ${px(t.exitPrice)}` : ''}
              </div>
            </div>
            {t.pnlUsd != null && t.status === 'closed' && (
              <div className="text-right shrink-0">
                <div className={cx('num text-[34px] font-semibold leading-none whitespace-nowrap', won ? 'text-up-d' : 'text-down-d')}>{usd(t.pnlUsd, { sign: true })}</div>
                <div className="num text-[13px] text-[#8A8A92] mt-1.5">{pctText(t.pnlPct)}</div>
              </div>
            )}
          </div>
          <div className="perf my-5" style={{ ['--notch' as string]: '#fff' }} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-[#8A8A92]">Member</dt>
            <dd className="text-right min-w-0">
              <a href={nearAccountUrl(t.accountId)} target="_blank" rel="noreferrer" className="num text-white truncate block">
                {t.accountId}
              </a>
            </dd>
            <dt className="text-[#8A8A92]">How</dt>
            <dd className="text-white text-right">{t.mode === 'ask' ? 'Proposed, approved by the member' : 'Autopilot, inside their mandate'}</dd>
            {t.coinAmount != null && (
              <>
                <dt className="text-[#8A8A92]">Bought</dt>
                <dd className="num text-white text-right">
                  {qty(t.coinAmount)} {t.coin}
                </dd>
              </>
            )}
            {t.exitReason && (
              <>
                <dt className="text-[#8A8A92]">Ended</dt>
                <dd className="text-white text-right">{t.exitReason}</dd>
              </>
            )}
            <dt className="text-[#8A8A92]">Fingerprint</dt>
            <dd className="num text-white text-right truncate">{t.hash.slice(0, 18)}…</dd>
          </dl>
        </div>

        {/* the plan on its chart */}
        <div className="rounded-[24px] bg-ink text-white p-3 md:p-4">
          <div className="flex items-center justify-between gap-3 px-1 md:px-2 pt-1">
            <div>
              <div className="text-[14.5px] font-semibold">{t.plan ? 'The plan on its chart' : 'Its chart'}</div>
              <div className="text-[12px] text-[#8A8A92]">{t.plan ? 'Entry, stop and target from the sealed plan' : 'The plan shows here once it opens'}</div>
            </div>
            <Segmented night size="sm" layoutId="receipt-tf" value={shownTf} onChange={setTf} options={(['1d', '4h', '1h', '15m'] as DrawTf[]).map(x => ({ value: x, label: x.toUpperCase() }))} />
          </div>
          <div className="mt-3 rounded-[16px] bg-[#0E0E10] border border-white/[0.05] p-2">
            <AgentDrawing coin={t.coin} tf={shownTf} size="stage" plan={plan} markers={markers} className="aspect-[1/1] sm:aspect-[16/10]" label={`ParallaxPay's ${t.coin} chart with this plan`} />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Timeline t={t} mounted={mounted} />
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <div className="rounded-[22px] border border-line p-5 md:p-6">
          <h2 className="font-heading text-[19px] font-black tight">The plan</h2>
          {t.plan ? (
            <>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  ['Entry', t.plan.entry.priceAtIssue, 'text-ink'],
                  ['Stop', t.plan.stop, 'text-down'],
                  ['Target', t.plan.target, 'text-up'],
                ].map(([k, v, c]) => (
                  <div key={k as string} className="rounded-[14px] bg-paper-2 p-3 text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{k as string}</div>
                    <div className={cx('num text-[15px] mt-1', c as string)}>{px(v as number)}</div>
                  </div>
                ))}
              </div>
              <ul className="mt-4 grid gap-1.5 text-[14px] text-ink-2">
                {t.plan.why.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-3">·</span>
                    {w}
                  </li>
                ))}
              </ul>
              {analyst?.provider === 'near-ai' && (
                <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-line p-3.5">
                  <Avatar actor="analyst" size={30} />
                  <div className="text-[13.5px] text-ink-2 leading-snug">
                    <b className="text-ink">The analyst agreed.</b> A second agent on NEAR AI Cloud ({analyst.model}) reviewed the same chart inside a TEE and signed its answer. Graded {t.plan.conviction}/5.
                  </div>
                </div>
              )}
              {t.planJson && (
                <details className="mt-4">
                  <summary className="text-[13px] text-ink-3 cursor-pointer">The exact sealed text</summary>
                  <pre className="mt-2 p-3 rounded-[12px] bg-paper-2 text-[11.5px] num whitespace-pre-wrap break-all">{t.planJson}</pre>
                  <div className="text-[12px] text-ink-3 mt-2 break-all">salt {t.salt}</div>
                </details>
              )}
            </>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-dashed border-line p-4">
              <span className="w-9 h-9 rounded-full foil grid place-items-center text-white shrink-0">
                <IconLock size={15} />
              </span>
              <p className="text-[14px] text-ink-2 leading-snug">Still sealed. Only its fingerprint is public until the trade ends; then the plan opens here and this page checks it against the fingerprint.</p>
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-line p-5 md:p-6">
          <h2 className="font-heading text-[19px] font-black tight">Check it yourself</h2>
          <div className="grid gap-3 mt-4">
            <Verified ok={chain ? chain.ok : null}>
              The vault on NEAR holds this fingerprint for plan #{t.callId}: <span className="num break-all text-[12px]">{t.hash}</span>
              {chain && mounted && <> · sealed at block {chain.block}, {new Date(chain.at * 1000).toLocaleString()}</>}
            </Verified>
            {t.opened ? (
              <Verified ok={hashOk}>sha256(salt + plan) of the plan on this page matches that fingerprint, computed in your browser just now.</Verified>
            ) : (
              <Verified ok={null}>The plan is still sealed. It opens when the trade ends; then this page checks it against the fingerprint.</Verified>
            )}
            {analyst?.provider === 'near-ai' && (
              <Verified ok={analyst.signature ? sigOk : false}>
                The analyst&rsquo;s answer is signed by its enclave key {analyst.signature ? `${analyst.signature.signing_address.slice(0, 10)}…` : '(no signature returned)'}, recovered in your browser.
              </Verified>
            )}
            {analyst?.provider === 'rules' && <Verified ok>This plan came from ParallaxPay&rsquo;s rules alone; no model was asked.</Verified>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[13px] text-ink-3">
            <TxLink hash={t.txs.seal}>Sealed</TxLink>
            {t.txs.entry && t.txs.entry !== t.txs.seal && <TxLink hash={t.txs.entry}>Bought</TxLink>}
            <TxLink hash={t.txs.exit}>Sold</TxLink>
            <TxLink hash={t.txs.reveal}>Opened</TxLink>
            <a href={nearAccountUrl(VAULT_ID)} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">
              The vault
            </a>
          </div>
        </div>
      </div>

      {shotOk && (
        <div className="mt-4 rounded-[22px] bg-ink text-white p-4 md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-[19px] font-black tight">The exact chart it read when it sealed this</h2>
            <span className="text-[12.5px] text-[#8A8A92]">{analyst?.provider === 'near-ai' ? 'The analyst reviewed this same image' : '1D, 4H, 1H and 15m'}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/near/chart/pos-${t.id}`} alt={`The ${t.coin} chart ParallaxPay read: four timeframes with support, resistance and money flow`} onError={() => setShotOk(false)} className="mt-3 w-full rounded-[14px]" />
        </div>
      )}
    </div>
  )
}
