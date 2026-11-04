'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { recoverMessageAddress } from 'viem'
import { Eyebrow, Panel } from '@/components/kit'
import { Avatar } from '@/components/near/agent'
import { TxLink, Verified, money, pctText, qty } from '@/components/near/kit'
import { LiveChart, TfTabs, type ChartTf } from '@/components/near/LiveChart'
import { cx } from '@/components/ui'
import { VAULT_ID, coinById, nearAccountUrl } from '@/lib/near/config'
import { useTrade } from '@/lib/near/hooks'
import { vault } from '@/lib/near/vault'

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)))

const OUTCOME: Record<string, string> = { open: 'Open', closed: 'Closed', not_filled: "Didn't fill", declined: 'Not taken', proposed: 'Waiting' }

/**
 * One trade's receipt: the chart ParallaxPay read when it sealed the plan, price since, the plan once
 * opened, and the checks anyone can repeat in their own browser.
 */
export default function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error } = useTrade(Number(id))
  const t = data?.trade
  const [hashOk, setHashOk] = useState<boolean | null>(null)
  const [chain, setChain] = useState<{ ok: boolean; block: string; at: number } | null>(null)
  const [sigOk, setSigOk] = useState<boolean | null>(null)
  const [shotOk, setShotOk] = useState(true)
  const [tf, setTf] = useState<ChartTf>('1h')

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

  if (error) return <div className="max-w-[760px] mx-auto px-4 pt-10 text-ink-2">No such trade.</div>
  if (!t) return <div className="max-w-[1100px] mx-auto px-4 pt-10"><div className="h-72 rounded-[22px] bg-paper-2 animate-pulse" /></div>

  const coin = coinById(t.token)
  const won = t.pnlUsd != null && t.pnlUsd >= 0
  const analyst = t.plan?.analyst
  const markers = [
    ...(t.createdAt ? [{ ts: t.createdAt, text: 'sealed' }] : []),
    ...(t.openedAt ? [{ ts: t.openedAt, text: 'bought', below: true }] : []),
    ...(t.closedAt && t.status === 'closed' ? [{ ts: t.closedAt, text: 'sold' }] : []),
  ]
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-16">
      <Link href="/record" className="text-[13.5px] text-ink-3 underline decoration-line underline-offset-2">
        The record
      </Link>
      <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-4 md:gap-5 mt-3">
        <div className="grid gap-4 content-start">
          <Panel tone="ticket" className="p-5 md:p-6">
            <div className="flex items-center gap-3">
              <Avatar actor="parallaxpay" size={34} />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">ParallaxPay · plan #{t.callId ?? '—'}</div>
                <div className="text-[12px] text-[#8A8A92]">{t.opened ? 'Opened on NEAR' : 'Sealed on NEAR'} · {OUTCOME[t.status] ?? t.status}</div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-4 mt-5">
              <div>
                <div className="font-heading text-[46px] font-black tight text-white leading-none">{t.coin}</div>
                <div className="num text-[14px] text-[#C9C9CF] mt-2">
                  {money(t.usdcIn)} {t.entryPrice ? `at ${money(t.entryPrice)}` : ''} {t.exitPrice ? `→ ${money(t.exitPrice)}` : ''}
                </div>
              </div>
              {t.pnlUsd != null && (
                <div className="text-right">
                  <div className={cx('num text-[34px] font-semibold', won ? 'text-up-d' : 'text-down-d')}>{money(t.pnlUsd, { sign: true })}</div>
                  <div className="num text-[13px] text-[#8A8A92]">{pctText(t.pnlPct)}</div>
                </div>
              )}
            </div>
            <div className="perf my-5" style={{ ['--notch' as string]: '#fff' }} />
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-[#8A8A92]">Member</dt>
              <dd className="text-right">
                <a href={nearAccountUrl(t.accountId)} target="_blank" rel="noreferrer" className="num text-white truncate">
                  {t.accountId}
                </a>
              </dd>
              <dt className="text-[#8A8A92]">How</dt>
              <dd className="text-white text-right">{t.mode === 'ask' ? 'Proposed, approved by the member' : 'Autopilot'}</dd>
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
            </dl>
          </Panel>

          {t.plan && (
            <Panel className="p-5 md:p-6">
              <h2 className="font-heading text-[19px] font-black tight">The plan</h2>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  ['Entry', t.plan.entry.priceAtIssue],
                  ['Stop', t.plan.stop],
                  ['Target', t.plan.target],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-[12px] bg-paper-2 p-3 text-center">
                    <Eyebrow>{k as string}</Eyebrow>
                    <div className="num text-[15px] mt-1">{money(v as number)}</div>
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
                <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-line p-3.5">
                  <Avatar actor="analyst" size={30} />
                  <div className="text-[13.5px] text-ink-2 leading-snug">
                    <b className="text-ink">The analyst agreed</b> on NEAR AI Cloud ({analyst.model}), inside a TEE. Graded {t.plan.conviction}/5.
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
            </Panel>
          )}
        </div>

        <div className="grid gap-4 content-start">
          {shotOk && (
            <Panel className="p-4 md:p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-[17px] font-black tight">What ParallaxPay saw when it sealed this</h2>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/near/chart/pos-${t.id}`} alt={`The ${t.coin} chart ParallaxPay read: four timeframes with support, resistance and MFI`} onError={() => setShotOk(false)} className="mt-3 w-full rounded-[12px] border border-line" />
              <p className="text-[12.5px] text-ink-3 mt-2 leading-snug">1D, 4H, 1H and 15m, with the support (green) and resistance (red) it detected and MFI under each. {analyst?.provider === 'near-ai' ? 'The analyst reviewed this same image.' : ''}</p>
            </Panel>
          )}
          {coin && (
            <Panel className="p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading text-[17px] font-black tight">Price since</h2>
                <TfTabs tf={tf} onChange={setTf} dark={false} />
              </div>
              <div className="mt-3">
                <LiveChart coin={coin.symbol} tf={tf} theme="light" height={300} refreshMs={t.status === 'open' ? 30_000 : 0} levels={{ entry: t.entryPrice, stop: t.stop || null, target: t.target || null, exit: t.exitPrice }} markers={markers} />
              </div>
            </Panel>
          )}
          <Panel className="p-5 md:p-6">
            <h2 className="font-heading text-[19px] font-black tight">Check it yourself</h2>
            <div className="grid gap-3 mt-4">
              <Verified ok={chain ? chain.ok : null}>
                The vault on NEAR holds this fingerprint for plan #{t.callId}: <span className="num break-all text-[12px]">{t.hash}</span>
                {chain && <> · sealed at block {chain.block}, {new Date(chain.at * 1000).toLocaleString()}</>}
              </Verified>
              {t.opened ? (
                <Verified ok={hashOk}>sha256(salt + plan) of the plan on this page matches that fingerprint, computed in your browser just now.</Verified>
              ) : (
                <Verified ok={null}>The plan is still sealed. It opens when the trade ends; then this page checks it against the fingerprint.</Verified>
              )}
              {analyst?.provider === 'near-ai' && (
                <Verified ok={analyst.signature ? sigOk : false}>
                  The analyst's answer is signed by its enclave key {analyst.signature ? `${analyst.signature.signing_address.slice(0, 10)}…` : '(no signature returned)'}, recovered in your browser.
                </Verified>
              )}
              {analyst?.provider === 'rules' && <Verified ok>This plan came from ParallaxPay's rules alone; no model was asked.</Verified>}
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
          </Panel>
        </div>
      </div>
    </div>
  )
}
