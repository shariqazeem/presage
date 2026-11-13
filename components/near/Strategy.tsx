'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { IconCheck, IconChevron, IconLock } from '../icons'
import { Sheet } from '../kit'
import { Mark } from '../shell/Mark'
import { cx } from '../ui'
import { BLOCK_DEFS, HOUSE, sameBlocks, traits, type BlockDef, type Blocks } from '@/lib/near/strategy'
import { cacheStrategy, cachedStrategy, strategyCall, type UnlockedStrategy } from '@/lib/near/strategyClient'
import { useNear } from './NearWallet'
import { Switch } from './primitives'
import { sayError } from './sheets'

/**
 * Your agent's strategy: ParallaxPay's house method by default, or your own, made from the same building
 * blocks the engine uses or taught in your own words. Changes are signed with your account; the vault still
 * enforces your mandate whatever the strategy.
 */

/** The member's strategy with its settings, opened with one signature and then kept on this device. */
export function useMyStrategy() {
  const { accountId, kind, signMessage } = useNear()
  const [mine, setMine] = useState<UnlockedStrategy | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setMine(accountId ? cachedStrategy(accountId) : null)
  }, [accountId])
  const open = async () => {
    if (!accountId) return null
    setBusy(true)
    try {
      const { strategy } = await strategyCall(signMessage, accountId, 'mine')
      cacheStrategy(accountId, strategy)
      setMine(strategy)
      return strategy
    } catch (e) {
      sayError(e)
      return null
    } finally {
      setBusy(false)
    }
  }
  // The built-in account signs without a pop-up, so its strategy opens by itself.
  useEffect(() => {
    if (accountId && kind === 'device' && !cachedStrategy(accountId)) void open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, kind])
  const set = (s: UnlockedStrategy) => {
    if (accountId) cacheStrategy(accountId, s)
    setMine(s)
  }
  return { mine, open, busy, set }
}

function Chips({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(t => (
        <span key={t} className={cx('rounded-full px-2.5 h-[26px] inline-flex items-center text-[12.5px]', dark ? 'bg-white/[0.08] text-[#C9C9CF]' : 'bg-paper-2 text-ink-2')}>
          {t}
        </span>
      ))}
    </div>
  )
}

/** On your agent's page: which strategy it runs, one tap from changing it. */
export function StrategyCard({ onChange, my }: { onChange: () => void; my: ReturnType<typeof useMyStrategy> }) {
  const { mine, open, busy } = my
  return (
    <div className="rounded-[22px] border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Its strategy</div>
          <div className="font-heading text-[18px] font-black tight mt-0.5 truncate">{mine ? (mine.house ? 'The house method' : mine.name) : 'Your agent’s strategy'}</div>
        </div>
        {mine?.adopted && <span className="rounded-full foil text-white px-2.5 h-[22px] inline-flex items-center text-[10.5px] font-semibold uppercase tracking-[0.07em] shrink-0">Adopted</span>}
      </div>
      <div className="mt-3">
        {mine ? (
          <Chips items={mine.house ? ['Buys at support after money flow bottoms', 'Needs 2.5× the risk', 'Holds up to 3 days'] : mine.traits} />
        ) : (
          <button onClick={() => void open()} disabled={busy} className="w-full rounded-[14px] bg-paper-2 px-3.5 py-3 text-left press disabled:opacity-60">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold">
              <IconLock size={14} /> {busy ? 'Opening…' : 'Sign to open its settings'}
            </span>
            <span className="block text-[12.5px] text-ink-3 mt-0.5">A signature with your account, not a transaction. Free.</span>
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button onClick={onChange} className="h-10 rounded-full bg-ink text-white text-[13.5px] font-semibold press">
          Shape its strategy
        </button>
        <Link href="/board" className="h-10 px-3.5 rounded-full bg-paper-2 text-[13.5px] font-semibold press flex items-center gap-0.5">
          The board <IconChevron size={13} />
        </Link>
      </div>
    </div>
  )
}

/** For an agent that isn't funded yet: the studio, sealed. */
export function StrategyTeaser({ onFund }: { onFund: () => void }) {
  return (
    <div className="rounded-[22px] border border-line p-4 relative overflow-hidden">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Its strategy</div>
      <div className="font-heading text-[18px] font-black tight mt-0.5">Teach it how you trade</div>
      <p className="text-[13.5px] text-ink-2 leading-snug mt-1.5">Funded agents can run your own strategy: tell it in your words, or tune its stop, its target and how picky it is. The best ones top the board.</p>
      <button onClick={onFund} className="mt-3 w-full h-10 rounded-full bg-ink text-white text-[13.5px] font-semibold press flex items-center justify-center gap-1.5">
        <IconLock size={13} /> Fund it to unlock
      </button>
    </div>
  )
}

type Opt = { value: string | number | boolean; label: string; line: string }

function BlockPicker({ def, value, onPick }: { def: BlockDef; value: Opt['value']; onPick: (v: Opt['value']) => void }) {
  const options = def.options as unknown as Opt[]
  const chosen = options.find(o => o.value === value)
  return (
    <div>
      <span className="text-[14px] font-semibold">{def.question}</span>
      <div className="mt-2 flex gap-1 p-1 rounded-[14px] bg-paper-2" role="radiogroup" aria-label={def.question}>
        {options.map(o => {
          const on = o.value === value
          return (
            <button key={String(o.value)} role="radio" aria-checked={on} onClick={() => onPick(o.value)} className={cx('flex-1 h-9 rounded-[10px] text-[13px] font-semibold transition-colors press', on ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink')}>
              {o.label}
            </button>
          )
        })}
      </div>
      <p className="text-[12.5px] text-ink-3 mt-1.5 leading-snug">{chosen?.line}</p>
    </div>
  )
}

/** The studio: teach it in words or set the blocks, name it, sign it. */
export function StrategyStudio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accountId, signMessage } = useNear()
  const { mine, open: unlock, busy: unlocking, set } = useMyStrategy()
  const [blocks, setBlocks] = useState<Blocks>(HOUSE)
  const [name, setName] = useState('')
  const [publish, setPublish] = useState(true)
  const [words, setWords] = useState('')
  const [taught, setTaught] = useState<{ blocks: Blocks; summary: string; by: 'near-ai' | 'words' } | null>(null)
  const [teaching, setTeaching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !mine) return
    setBlocks(mine.blocks)
    setName(mine.house ? '' : mine.name)
    setPublish(mine.house ? true : mine.public)
  }, [open, mine])

  const teach = async () => {
    if (!accountId) return
    setTeaching(true)
    try {
      const r = await strategyCall<{ blocks: Blocks; summary: string; by: 'near-ai' | 'words' }>(signMessage, accountId, 'teach', { words })
      setTaught(r)
    } catch (e) {
      sayError(e)
    }
    setTeaching(false)
  }
  const save = async (b: Blocks) => {
    if (!accountId) return
    setSaving(true)
    try {
      const { strategy } = await strategyCall(signMessage, accountId, 'save', { blocks: b, name: name.trim() || 'My strategy', publish, ...(taught && sameBlocks(taught.blocks, b) ? { words } : {}) })
      set(strategy)
      toast.success(strategy.house ? 'Back on the house method.' : `Your agent runs ${strategy.name} from its next read.`)
      onClose()
    } catch (e) {
      sayError(e)
    }
    setSaving(false)
  }

  const changed = mine ? !sameBlocks(blocks, mine.blocks) || (!mine.house && (name.trim() !== mine.name || publish !== mine.public)) : true
  const isHouse = sameBlocks(blocks, HOUSE)

  return (
    <Sheet open={open} onClose={onClose} title="Shape its strategy">
      {!mine ? (
        <div>
          <p className="text-[14px] text-ink-2 leading-snug -mt-1">Your agent&rsquo;s settings are sealed to your account. Sign once to open them here; it&rsquo;s a signature, not a transaction.</p>
          <button onClick={() => void unlock()} disabled={unlocking} className="mt-4 w-full h-12 rounded-[14px] bg-ink text-white font-semibold press disabled:opacity-50">
            {unlocking ? 'Opening…' : 'Sign to open'}
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          <section className="rounded-[20px] bg-ink text-white p-4 relative overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-[3px] foil-line" />
            <div className="flex items-center gap-2.5">
              <Mark size={28} />
              <div className="text-[14px] font-semibold">Teach it how you trade</div>
            </div>
            <textarea
              value={words}
              onChange={e => setWords(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="I buy right at support with a tight stop, want three times the risk, and I'm out within a day."
              className="mt-3 w-full rounded-[14px] bg-white/[0.07] px-3.5 py-3 text-[14px] leading-snug outline-none placeholder:text-[#8A8A92] resize-none"
            />
            <button onClick={teach} disabled={teaching || words.trim().length < 8} className="mt-2 w-full h-11 rounded-[12px] bg-white text-ink text-[14px] font-semibold press disabled:opacity-40">
              {teaching ? 'Thinking it through…' : 'Teach it'}
            </button>
            {taught && (
              <div className="mt-3 rounded-[14px] bg-white/[0.07] p-3.5">
                <p className="text-[14px] leading-snug">{taught.summary}</p>
                <div className="mt-2.5">
                  <Chips items={traits(taught.blocks)} dark />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-[#8A8A92]">{taught.by === 'near-ai' ? 'Set by NEAR AI, running in a TEE' : 'Read from your words'}</span>
                  <button
                    onClick={() => {
                      setBlocks(taught.blocks)
                      toast('Applied below. Check it, then sign.')
                    }}
                    className="h-9 px-3.5 rounded-full bg-white text-ink text-[13px] font-semibold press shrink-0"
                  >
                    Use these
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="grid gap-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 -mb-2">Or set it yourself</div>
            {BLOCK_DEFS.map(def => (
              <BlockPicker key={def.key} def={def} value={blocks[def.key]} onPick={v => setBlocks(b => ({ ...b, [def.key]: v }) as Blocks)} />
            ))}
            <p className="text-[12.5px] text-ink-3 leading-snug -mt-1">It always buys at a level price has respected, after money flow bottoms, and sells back to USDC. Your mandate (how much, how often, which coins) still holds, whatever the strategy.</p>
          </section>

          {!isHouse && (
            <section className="grid gap-3">
              <label className="block">
                <span className="text-[13px] font-semibold text-ink-2">Name it</span>
                <input value={name} onChange={e => setName(e.target.value.slice(0, 40))} placeholder="My strategy" className="mt-1.5 w-full h-12 rounded-[14px] border border-line px-4 text-[15px] outline-none focus:border-ink" />
              </label>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold">Show it on the board</div>
                  <div className="text-[12.5px] text-ink-3">Its record is public; its settings stay sealed until someone hires it.</div>
                </div>
                <Switch on={publish} onChange={() => setPublish(p => !p)} label="Show it on the board" />
              </div>
            </section>
          )}

          <div className="grid gap-2">
            <button onClick={() => void save(blocks)} disabled={saving || !changed} className="w-full h-[54px] rounded-[16px] bg-ink text-white font-semibold text-[15.5px] press disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? 'Signing…' : changed ? (isHouse ? 'Sign: back to the house method' : 'Sign and use this strategy') : (
                <>
                  <IconCheck size={14} weight={3} /> This is its strategy
                </>
              )}
            </button>
            {!mine.house && !isHouse && (
              <button onClick={() => void save(HOUSE)} disabled={saving} className="h-11 rounded-[14px] text-[14px] font-semibold text-ink-2 press">
                Back to the house method
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
