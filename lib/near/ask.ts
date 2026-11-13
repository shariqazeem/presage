import { chat, llmConfigured, models } from '../llm'
import { nearAiChat, nearAiConfigured } from './ai'
import { USDC, tokenById } from './config'
import { latestReads, money, positionsFor } from './store'
import { fromUnits } from './units'
import { ranked } from './rank'
import { coinsInWords, vault } from './vault'

/**
 * Ask ParallaxPay: questions answered in the agent's own voice from what it is reading right now, its
 * checklist for every coin, and (when the asker is a member) their own account. Answers come from an
 * open model on NEAR AI Cloud when it is configured.
 */

const RULES = [
  'You are ParallaxPay, an AI trading agent on NEAR. You trade the coins on Rhea (NEAR, ZEC, RHEA, AURORA and every other token with a deep enough classic pool that trades) for members from their own accounts in the ParallaxPay vault, inside rules each member sets on chain (ask first or autopilot, coins, largest buy, buys a day, style).',
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

export type Answer = { text: string; by: 'near-ai' | 'gateway' | 'rules'; model: string; chatId: string | null }

type ReadLite = {
  coin: string
  line: string
  setup: { stop: number; target: number; rr: number } | null
  armedAt?: number | null
  checks?: { key: string; label: string; ok: boolean | null; note: string }[]
}

/** What each check needs before it passes, said as a condition. */
const NEEDS: Record<string, string> = {
  support: 'price comes down to a level I trust',
  structure: 'a higher timeframe confirms that level',
  momentum: 'money flow bottoms out',
  htf: 'the bigger picture stops weakening',
  trend: 'the daily trend stops falling',
  room: 'there is at least 2.5 times the risk of room to the next resistance',
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/**
 * The answer when no model can give one (no credit, a timeout): its own live checks, said plainly. It
 * covers what people ask most (why not this coin, what would make it buy, which coin is closest, how it
 * limits a loss), so the box never comes back empty.
 */
function fromRules(question: string, account: { id: string; member: Awaited<ReturnType<typeof vault.member>> } | null): string {
  const reads = ranked(latestReads() as ReadLite[])
  const q = question.toLowerCase()
  if (/\b(loss|losses|stop|risk|safe|lose)\b/.test(q))
    return "Every plan gets a stop just under the level I buy on, sealed on NEAR before the trade so it can't be moved after. If price closes under it, I sell. I only buy when the next resistance is at least 2.5 times the risk away, each buy stays inside your mandate, and I cut a buy down if its pool is too thin to take it cleanly."
  if (account?.member && /\b(my|account|balance|holding)\b/.test(q)) {
    const open = positionsFor(account.id).filter(p => p.status === 'open')
    return open.length
      ? `You have ${open.length} open trade${open.length === 1 ? '' : 's'}: ${open.map(p => `${p.coin} bought at ${money(p.entryPrice ?? 0)}, stop ${money(p.stop)}, target ${money(p.target)}`).join('; ')}. I watch each stop and target every couple of minutes.`
      : `No open trades right now. I'm watching ${coinsInWords(account.member.rules.coins, 'every coin I trade')} for you and act when a setup passes all six checks.`
  }
  const named = reads.find(r => new RegExp(`(^|[^a-z0-9])${r.coin.toLowerCase().replace(/[^a-z0-9]/g, '\\$&')}([^a-z0-9]|$)`).test(q))
  const r = named ?? reads[0]
  if (!r) return "I haven't finished my first read yet. Give me a minute."
  const missing = (r.checks ?? []).filter(c => c.ok === false)
  const passed = (r.checks ?? []).filter(c => c.ok).length
  if (!named && /\b(closest|which|most|watching)\b/.test(q)) return `${r.coin} is closest, with ${passed} of my 6 checks passing. ${r.line}`
  if (r.setup) return r.line
  if (/(make you|would you|will you|when).*\bbuy\b/.test(q))
    return missing.length ? `I'd buy ${r.coin} when ${list(missing.map(c => NEEDS[c.key] ?? c.label.toLowerCase()))}. Right now: ${r.line}` : `Everything lines up on ${r.coin}; I measure the risk before I commit. ${r.line}`
  return missing.length ? `${r.line} Still missing: ${list(missing.map(c => c.label.charAt(0).toLowerCase() + c.label.slice(1)))}.` : r.line
}

export async function ask(question: string, accountId: string | null): Promise<Answer> {
  const member = accountId ? await vault.member(accountId).catch(() => null) : null
  const asker = accountId && member ? { id: accountId, member } : null
  const rulesAnswer = (): Answer => ({ text: fromRules(question, asker), by: 'rules', model: 'its live checks', chatId: null })
  const messages = [
    { role: 'system' as const, content: RULES },
    { role: 'user' as const, content: `${context(asker)}\n\nQuestion: ${question}` },
  ]
  if (nearAiConfigured()) {
    try {
      const a = await nearAiChat({ messages, maxTokens: 300, temperature: 0.3, timeoutMs: 30_000, quick: true })
      return { text: a.text.trim(), by: 'near-ai', model: a.model, chatId: a.chatId }
    } catch (e) {
      // Out of credit, a timeout: the question still gets answered, by the other model or its own checks.
      console.warn(`NEAR AI didn't answer: ${e instanceof Error ? e.message.slice(0, 160) : e}`)
    }
  }
  if (!llmConfigured()) return rulesAnswer()
  try {
    const model = models.oracle()[0] ?? models.vision()
    const text = await chat({ model, messages, maxTokens: 260, temperature: 0.3, timeoutMs: 45_000 })
    return { text: text.trim(), by: 'gateway', model, chatId: null }
  } catch (e) {
    console.warn(`The gateway didn't answer: ${e instanceof Error ? e.message.slice(0, 160) : e}`)
    return rulesAnswer()
  }
}
