'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'
import type { CallView } from '../server/records'

/** A paid Oracle question as the asker sees it. */
export type Vote = { model: string; direction: 'up' | 'down'; confidence: number; why: string }
export type Progress = { stage: 'reading' | 'voting' | 'sealing'; votes: Vote[]; voters: string[] }
export type OracleAnswer = {
  requestId: Hex
  status: string
  asset: string
  horizon: string
  payTx: string | null
  error: string | null
  progress?: Progress | null
  myCall: 'up' | 'down' | null
  createdAt: number
  paidAt: number | null
  call: null | {
    id: number
    chainCallId: number | null
    status: string
    sealTx: string | null
    sealTxUrl: string | null
    sealedAt: number | null
    revealBy: number
    outcome: 'win' | 'loss' | 'flat' | 'nofill' | null
    result: number | null
    asset: string
    market: string | null
    direction: 'up' | 'down'
    confidence: number
    horizonSec: number
    priceAtIssue: number
    issuedAt: number
    flatBandBps: number
    why: string
    detail: string | null
    models: { model: string; direction: 'up' | 'down'; confidence: number }[]
    exitPrice: number | null
    revealedAt: number | null
    receipt: string
  }
}

/** What this browser keeps about a question it paid for: the secret is what unlocks the answer. */
export type Saved = { requestId: Hex; secret: string; asset: string; horizon: string; at: number; myCall?: 'up' | 'down' | null }

const key = (a?: string | null) => `called_oracle_history_${a?.toLowerCase() ?? 'anon'}`

function read(k: string): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]') as Saved[]
  } catch {
    return []
  }
}

export function saveQuestion(address: string | undefined | null, s: Saved) {
  try {
    const k = key(address)
    localStorage.setItem(k, JSON.stringify([s, ...read(k).filter(x => x.requestId !== s.requestId)].slice(0, 60)))
    window.dispatchEvent(new Event('called:questions'))
  } catch {}
}

export function savedQuestions(address?: string | null): Saved[] {
  const mine = read(key(address))
  const anon = address ? read(key(null)) : []
  const seen = new Set<string>()
  return [...mine, ...anon].filter(s => (seen.has(s.requestId) ? false : (seen.add(s.requestId), true))).sort((a, b) => b.at - a.at)
}

/** Your paid questions with their answers, refreshed while any is still open. */
export function useMyQuestions(address?: string | null) {
  const [bump, setBump] = useState(0)
  useEffect(() => {
    const on = () => setBump(b => b + 1)
    window.addEventListener('called:questions', on)
    return () => window.removeEventListener('called:questions', on)
  }, [])
  const [saved, setSaved] = useState<Saved[]>([])
  useEffect(() => setSaved(savedQuestions(address)), [address, bump])
  const q = useQuery({
    queryKey: ['my-questions', address ?? 'anon', saved.map(s => s.requestId).join(',')],
    enabled: saved.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await fetch('/api/oracle/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: saved.slice(0, 40).map(s => ({ requestId: s.requestId, secret: s.secret })) }),
      })
      const j = (await r.json()) as { answers: (OracleAnswer | { requestId: string; error: string })[] }
      // A real answer always has a status; an unknown request comes back as just {requestId, error}.
      return j.answers.filter((a): a is OracleAnswer => 'status' in a)
    },
  })
  const items = useMemo(
    () =>
      saved
        .map(s => ({ saved: s, answer: q.data?.find(a => a.requestId === s.requestId) }))
        .filter(x => x.answer || Date.now() - x.saved.at < 20 * 60_000),
    [saved, q.data],
  )
  return { items, loading: q.isLoading && saved.length > 0 }
}

/** A paid answer in the same shape as any other call, so it reads the same everywhere. */
export function answerToView(a: OracleAnswer): CallView | null {
  const c = a.call
  if (!c) return null
  return {
    id: c.id,
    chainCallId: c.chainCallId,
    agentId: 0,
    agentName: 'Market Oracle',
    agentSlug: 'oracle',
    kind: 'direction',
    status: c.status as CallView['status'],
    sealTx: c.sealTx,
    sealedAt: c.sealedAt,
    revealBy: c.revealBy,
    commitment: '',
    issuedAt: c.issuedAt,
    outcome: c.outcome,
    result: c.result,
    revealTx: null,
    revealedAt: c.revealedAt,
    settleTx: null,
    resolution: c.exitPrice != null ? { exitPrice: c.exitPrice } : null,
    payload: {
      v: 1,
      rules: 'called/direction-v1',
      agent: 0,
      asset: { symbol: c.asset, source: 'binance', market: c.market ?? '' },
      direction: c.direction,
      confidence: c.confidence,
      horizonSec: c.horizonSec,
      issuedAt: c.issuedAt,
      priceAtIssue: c.priceAtIssue,
      flatBandBps: c.flatBandBps,
      why: c.why,
      models: c.models,
    },
    payloadJson: null,
    salt: null,
    asset: c.asset,
    side: c.direction,
    hidden: false,
    horizonSec: c.horizonSec,
    opensAt: c.issuedAt + c.horizonSec,
    paid: true,
  }
}

/* ---------------------------------------------------------------- the day streak */

const today = () => new Date().toLocaleDateString('en-CA')
const yesterday = () => new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA')

/** Days in a row this wallet has opened Called, counted on this device. */
export function useStreak(address?: string | null): { count: number; best: number } {
  const [s, setS] = useState({ count: 0, best: 0 })
  useEffect(() => {
    if (!address) return setS({ count: 0, best: 0 })
    const k = `called_streak_${address.toLowerCase()}`
    try {
      const prev = JSON.parse(localStorage.getItem(k) ?? 'null') as { day: string; count: number; best: number } | null
      const d = today()
      let next = prev ?? { day: d, count: 1, best: 1 }
      if (prev && prev.day !== d) next = { day: d, count: prev.day === yesterday() ? prev.count + 1 : 1, best: prev.best }
      next.best = Math.max(next.best, next.count)
      localStorage.setItem(k, JSON.stringify(next))
      setS({ count: next.count, best: next.best })
    } catch {}
  }, [address])
  return s
}

/** When you were last here, read once per visit, so Today can say what happened since. */
export function useLastVisit(): number | null {
  const [last, setLast] = useState<number | null>(null)
  useEffect(() => {
    try {
      const prev = Number(localStorage.getItem('called_last_visit') ?? 0) || null
      setLast(prev)
      const mark = () => localStorage.setItem('called_last_visit', String(Math.floor(Date.now() / 1000)))
      const t = setTimeout(mark, 4000)
      return () => clearTimeout(t)
    } catch {}
  }, [])
  return last
}

export function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
