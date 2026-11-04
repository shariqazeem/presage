'use client'

import { useState } from 'react'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { useNear } from './NearWallet'

type Turn = { q: string; a?: string; by?: 'near-ai' | 'gateway'; model?: string; error?: string }

/** Ask the agent about what it sees, answered from its live reads (and your account, when you're a member). */
export function Ask({ coin, dark = true }: { coin?: string; dark?: boolean }) {
  const { accountId } = useNear()
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const suggestions = [
    coin ? `Why aren't you buying ${coin} right now?` : 'What are you watching most closely?',
    coin ? `What would make you buy ${coin}?` : 'Which coin is closest to a setup?',
    accountId ? 'How is my account doing?' : 'How do you limit a loss?',
  ]
  const go = async (question: string) => {
    const text = question.trim()
    if (text.length < 3 || busy) return
    setBusy(true)
    setQ('')
    setTurns(t => [...t, { q: text }].slice(-4))
    try {
      const r = await fetch('/api/near/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text, account: accountId ?? undefined }) })
      const body = (await r.json()) as { text?: string; by?: 'near-ai' | 'gateway'; model?: string; error?: string }
      setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, a: body.text, by: body.by, model: body.model, error: r.ok ? undefined : body.error } : x)))
    } catch {
      setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, error: 'Couldn’t reach the agent. Try again.' } : x)))
    }
    setBusy(false)
  }
  const sub = dark ? 'text-[#8A8A92]' : 'text-ink-3'
  return (
    <div>
      {turns.length > 0 && (
        <ol className="grid gap-3 mb-3">
          {turns.map((t, i) => (
            <li key={i} className="grid gap-2">
              <div className={cx('justify-self-end max-w-[85%] rounded-[14px] rounded-br-[4px] px-3.5 py-2 text-[13.5px]', dark ? 'bg-white text-ink' : 'bg-ink text-white')}>{t.q}</div>
              <div className="flex gap-2.5 max-w-[92%]">
                <Mark size={26} />
                <div className={cx('rounded-[14px] rounded-tl-[4px] px-3.5 py-2.5 text-[13.5px] leading-snug', dark ? 'bg-white/[0.07] text-[#E6E6E3]' : 'bg-paper-2 text-ink-2')}>
                  {t.error ? <span className="text-down-d">{t.error}</span> : t.a ?? <span className={cx('animate-[soft-pulse_1.2s_ease-in-out_infinite]', sub)}>Reading the charts…</span>}
                  {t.a && t.by === 'near-ai' && <div className={cx('label !text-[8.5px] mt-1.5', sub)}>answered on NEAR AI · {t.model}</div>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        onSubmit={e => {
          e.preventDefault()
          void go(q)
        }}
        className={cx('flex items-center gap-2 rounded-[14px] pl-3 pr-1.5 py-1.5 border', dark ? 'bg-white/[0.05] border-white/10 focus-within:border-white/30' : 'bg-white border-line focus-within:border-ink')}
      >
        <Mark size={22} />
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={400} placeholder="Ask ParallaxPay what it sees…" className={cx('flex-1 bg-transparent outline-none text-[14px] min-w-0', dark ? 'text-white placeholder:text-[#6B6B72]' : 'text-ink placeholder:text-ink-3')} />
        <button disabled={busy || q.trim().length < 3} className={cx('h-9 px-4 rounded-[10px] text-[13px] font-semibold shrink-0 disabled:opacity-40', dark ? 'bg-white text-ink' : 'bg-ink text-white')}>
          Ask
        </button>
      </form>
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.map(s => (
            <button key={s} onClick={() => void go(s)} className={cx('text-[12.5px] rounded-full px-3 py-1.5 transition-colors', dark ? 'bg-white/[0.06] text-[#C9C9CF] hover:text-white' : 'bg-paper-2 text-ink-2 hover:text-ink')}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
