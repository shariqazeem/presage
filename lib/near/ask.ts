import { chat, llmConfigured, models } from '../llm'
import { nearAiChat, nearAiConfigured } from './ai'
import { USDC, tokenById } from './config'
import { latestReads, money, positionsFor } from './store'
import { fromUnits } from './units'
import { coinsInWords, vault } from './vault'

/**
 * Ask ParallaxPay: questions answered in the agent's own voice from what it is reading right now, its
 * checklist for every coin, and (when the asker is a member) their own account. Answers come from an
 * open model on NEAR AI Cloud when it is configured.
 */

const RULES = [
  'You are ParallaxPay, an AI trading agent on NEAR. You trade NEAR, ZEC, RHEA and AURORA for members from their own accounts in the ParallaxPay vault, inside rules each member sets on chain (ask first or autopilot, coins, largest buy, buys a day, style).',
  'Your method: buy only on support that a higher timeframe confirms, when money flow (MFI) has bottomed, never in a daily downtrend; stop just under the level; sell at the next resistance worth at least 2.5 times the risk, or after 72 hours. Every plan is sealed on NEAR before the trade and opened after it.',
  'Answer in 2 to 4 short sentences, in plain words, as yourself ("I"). Use only the facts given. If they do not answer the question, say what would. Never promise profits and never tell anyone to buy or sell: explain what you see and what you would do under your rules.',
].join('\n')

function context(account: { id: string; member: Awaited<ReturnType<typeof vault.member>> } | null): string {
  const lines: string[] = ['What you see right now:']
  for (const r of latestReads() as Record<string, unknown>[]) {
    const checks = (r.checks as { label: string; ok: boolean | null; note: string }[] | undefined) ?? []
    const setup = r.setup as { stop: number; target: number; rr: number } | null
    lines.push(
      `- ${r.coin} at ${money(Number(r.price))}${r.change24h != null ? `, ${(Number(r.change24h) * 100).toFixed(1)}% in 24h` : ''}. ${r.line}` +
        (setup ? ` SETUP: buy, stop ${money(setup.stop)}, target ${money(setup.target)} (${setup.rr.toFixed(1)}x the risk).` : ` Not buying: ${r.blocker ?? 'no setup'}.`) +
        ` Checklist: ${checks.map(c => `${c.label} ${c.ok == null ? '?' : c.ok ? 'yes' : 'no'} (${c.note})`).join('; ')}.`,
    )
  }
  if (account?.member) {
    const m = account.member
    const held = Object.entries(m.balances)
      .map(([id, v]) => {
        const t = tokenById(id)
        return t ? `${Number(fromUnits(v, t.decimals).toPrecision(5))} ${t.symbol}` : null
      })
      .filter(Boolean)
      .join(', ')
    const open = positionsFor(account.id).filter(p => p.status === 'open')
    lines.push(
      `The person asking is the member ${account.id}: ${m.rules.autopilot ? 'autopilot' : 'ask first'}, coins: ${coinsInWords(m.rules.coins, 'any coin it lists')}, up to ${money(fromUnits(m.rules.max_trade, USDC.decimals))} a buy, ${m.rules.trades_per_day} buys a day (${m.buys_today} used today). Holding ${held || 'nothing'}. Open trades: ${open.map(p => `${p.coin} bought at ${money(p.entryPrice ?? 0)}, stop ${money(p.stop)}, target ${money(p.target)}`).join('; ') || 'none'}.`,
    )
  }
  return lines.join('\n')
}

export type Answer = { text: string; by: 'near-ai' | 'gateway'; model: string; chatId: string | null }

export async function ask(question: string, accountId: string | null): Promise<Answer> {
  const member = accountId ? await vault.member(accountId).catch(() => null) : null
  const messages = [
    { role: 'system' as const, content: RULES },
    { role: 'user' as const, content: `${context(accountId && member ? { id: accountId, member } : null)}\n\nQuestion: ${question}` },
  ]
  if (nearAiConfigured()) {
    const a = await nearAiChat({ messages, maxTokens: 260, temperature: 0.3, timeoutMs: 45_000 })
    return { text: a.text.trim(), by: 'near-ai', model: a.model, chatId: a.chatId }
  }
  if (!llmConfigured()) throw new Error('No model is configured')
  const model = models.oracle()[0] ?? models.vision()
  const text = await chat({ model, messages, maxTokens: 260, temperature: 0.3, timeoutMs: 45_000 })
  return { text: text.trim(), by: 'gateway', model, chatId: null }
}
