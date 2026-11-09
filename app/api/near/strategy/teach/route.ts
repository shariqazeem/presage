import { NextResponse, type NextRequest } from 'next/server'
import { nearAiChatJson, nearAiConfigured } from '@/lib/near/ai'
import { USDC_ID } from '@/lib/near/config'
import { SignatureError, verifyIntent, type SignedIntent } from '@/lib/near/signed'
import { BLOCK_DEFS, HOUSE, traits, validBlocks, type Blocks } from '@/lib/near/strategy'
import { vault } from '@/lib/near/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Teach it in your own words: NEAR AI (an open model in a TEE) turns how you trade into the agent's
 * building blocks, and you confirm them before anything changes. Only for members with money in the vault,
 * so the model's cost always has a paying member behind it. If the model is out of reach, a plain reading
 * of the words takes over and says so.
 */

const DAILY = 12
const used = new Map<string, { day: number; n: number }>()

const SYSTEM = `You turn a trader's description of how they trade into settings for ParallaxPay's trading agent.
The agent always buys at a support level that price has respected, only after money flow (MFI) bottoms, and always sells back to USDC. You choose only these six settings, each from its list:
${BLOCK_DEFS.map(d => `- ${d.key}: ${d.question} One of ${d.options.map(o => JSON.stringify(o.value)).join(', ')} (${d.options.map(o => `${JSON.stringify(o.value)} = ${o.line}`).join(' ')})`).join('\n')}
Anything the trader doesn't mention keeps the house value: ${JSON.stringify(HOUSE)}.
Answer with JSON only: {"entry":…,"stop":…,"reward":…,"hold":…,"trend":…,"picky":…,"summary":"one short sentence, in the second person, saying what you set and why"}.
If they ask for something the agent can't do (shorting, leverage, other coins' signals, guarantees), keep the house value for it and say so in the summary.`

/** A plain reading of the words, for when the model is out of reach. */
function fromWords(w: string): { blocks: Blocks; summary: string } {
  const t = w.toLowerCase()
  const b: Blocks = { ...HOUSE }
  if (/\b(right|exactly|only) (on|at) (the )?(level|support)\b|\bat the level\b/.test(t)) b.entry = 'at'
  else if (/\bnear (the )?(level|support)\b|\bclose enough\b|\bloose entr/.test(t)) b.entry = 'near'
  if (/\btight(er)? stop|\bsmall(er)? (loss|stop)|\bcut (losses )?(fast|quick)/.test(t)) b.stop = 'tight'
  else if (/\bwide(r)? stop|\broom to breathe|\bloose stop/.test(t)) b.stop = 'wide'
  const r = t.match(/(\d(?:\.\d)?)\s*(?:r\b|x\b|×|to 1|:1)/)
  if (r) {
    const n = Number(r[1])
    b.reward = ([1.5, 2, 2.5, 3, 4] as const).reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), 2.5 as Blocks['reward'])
  }
  if (/\b(a |one )?week|\bswing\b|\b7 days/.test(t)) b.hold = 168
  else if (/\b(a |one )?day\b|\bintraday|\b24 ?h/.test(t)) b.hold = 24
  if (/\b(downtrend|falling market|bear)s?\b.*\b(buy|trade|bounce)|\bbuy (the )?dips? (in|even)/.test(t)) b.trend = false
  if (/\bonly (the )?(best|strongest|a\+)\b/.test(t)) b.picky = 5
  else if (/\bstrong setups?\b|\bpicky\b/.test(t)) b.picky = 4
  else if (/\bmore trades\b|\baggressive\b/.test(t)) b.picky = 2
  return { blocks: b, summary: `Read from your words: ${traits(b).join(', ')}.` }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { signed?: SignedIntent }
  try {
    const intent = await verifyIntent(body.signed, 'teach')
    const words = String(intent.words ?? '').trim().slice(0, 600)
    if (words.length < 8) return NextResponse.json({ error: 'Tell it a little more about how you trade.' }, { status: 400 })
    const member = await vault.member(intent.account).catch(() => null)
    if (!member || BigInt(member.balances[USDC_ID] ?? '0') + Object.entries(member.balances).filter(([k]) => k !== USDC_ID).reduce((s, [, v]) => s + BigInt(v), 0n) === 0n) {
      return NextResponse.json({ error: 'Teaching is for funded agents. Add funds and it’s yours.' }, { status: 403 })
    }
    const day = Math.floor(Date.now() / 86_400_000)
    const u = used.get(intent.account)
    if (u && u.day === day && u.n >= DAILY) return NextResponse.json({ error: `That's ${DAILY} lessons today. Use the building blocks, or try again tomorrow.` }, { status: 429 })
    used.set(intent.account, { day, n: u && u.day === day ? u.n + 1 : 1 })

    if (nearAiConfigured()) {
      try {
        const { value, answer } = await nearAiChatJson<Partial<Blocks> & { summary?: string }>({
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: words },
          ],
          maxTokens: 300,
          timeoutMs: 30_000,
        })
        const blocks = validBlocks({ ...HOUSE, ...value })
        if (blocks) return NextResponse.json({ blocks, summary: String(value.summary ?? '').slice(0, 240) || `Set: ${traits(blocks).join(', ')}.`, by: 'near-ai', model: answer.model, chatId: answer.chatId })
      } catch {
        // Out of reach or out of credit: the plain reading below.
      }
    }
    return NextResponse.json({ ...fromWords(words), by: 'words' })
  } catch (e) {
    if (e instanceof SignatureError) return NextResponse.json({ error: e.message }, { status: 401 })
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 160) : 'Something went wrong' }, { status: 500 })
  }
}
