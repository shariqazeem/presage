import { readFileSync } from 'node:fs'
import { feedName } from '../../lib/near/config'
import { nearAiChatJson, nearAiConfigured, nearAiModel, nearAiSignature, type NearAiSignature } from '../../lib/near/ai'
import { errMsg, log } from '../log'
import { renderChart } from '../stquant/charts.js'
import { usd, type Read, type Setup } from './brain'

const l = log('near-analyst')
const RUBRIC = readFileSync(new URL('../stquant/RUBRIC.md', import.meta.url), 'utf8')

export type Verdict = {
  verdict: 'BUY' | 'WAIT' | 'AVOID'
  conviction: number
  why: string
  /** What the chart shows, for someone who has never traded. */
  plain: string
  wouldChangeMind: string
  /** Where the verdict came from: a NEAR AI Cloud model in a TEE (with its signature), or the rules alone. */
  source: { provider: 'near-ai'; model: string; chatId: string; signature: NearAiSignature | null } | { provider: 'rules' }
}

type Reply = Omit<Verdict, 'source'>

/**
 * A second opinion on a setup the rules found: the founder's rubric applied to the rendered chart by
 * an open model on NEAR AI Cloud. It can pass on a setup or lower its grade; it never sets prices.
 */
export async function review(read: Read, setup: Setup): Promise<Verdict> {
  const rulesOnly: Verdict = {
    verdict: 'BUY',
    conviction: setup.conviction,
    why: setup.reasons.slice(0, 2).join('; '),
    plain: `${read.coin.symbol} is sitting on a level buyers have defended, after a pullback.`,
    wouldChangeMind: `a close below ${usd(setup.stop)}`,
    source: { provider: 'rules' },
  }
  if (!nearAiConfigured()) return rulesOnly
  const text = [
    'You are the analyst for ParallaxPay, an AI agent that trades spot crypto for its members on NEAR.',
    'It buys at market through a Rhea pool (0.3% fee each way) and can only be long or in cash.',
    'Apply the rubric exactly as written. Do not invent rules or add criteria it does not contain.',
    '',
    'CALIBRATION. Every plan you approve is sealed on NEAR before the trade and opened after it, losses',
    'included, and it spends members’ real money. Grade the setup in front of you against the rubric.',
    'Conviction: 5 = every rubric condition present; 4 = one soft condition missing; 3 = right idea,',
    'wrong moment; 2 = resembles the setup but is structurally wrong; 1 = the inverse of the method.',
    '',
    '=== RUBRIC ===',
    RUBRIC,
    '=== END RUBRIC ===',
    '',
    `Coin: ${read.coin.symbol} (${feedName(read.coin)} candles). Last price ${read.price}.`,
    `The plan you are grading: buy at market, stop ${setup.stop}, target ${setup.target}${setup.r1 ? `, first resistance ${setup.r1}` : ''} (${setup.rr.toFixed(1)}R).`,
    `What the rules engine saw: ${setup.reasons.slice(0, 8).join(' | ')}`,
    '',
    'The image has four panels (1D, 4H, 1H, 15m), each with MFI below. Dashed green is detected support',
    'with its touch count, dashed red is resistance, blue dotted is the last price. Work top-down.',
    '',
    'Reply with JSON only: {"verdict":"BUY"|"WAIT"|"AVOID","conviction":1-5,"why":"one or two sentences",' +
      '"plain":"what the chart shows, in one sentence of at most 20 words that someone who has never traded understands; describe it, never tell the reader to buy or sell, and name no indicators",' +
      '"wouldChangeMind":"what would invalidate this"}',
  ].join('\n')
  try {
    const png = renderChart({ symbol: read.coin.symbol, frames: read.frames })
    const model = nearAiModel()
    const { value, answer } = await nearAiChatJson<Reply>({
      model,
      maxTokens: 700,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
          ],
        },
      ],
    })
    const verdict = value.verdict === 'BUY' || value.verdict === 'AVOID' ? value.verdict : 'WAIT'
    const conviction = Math.max(1, Math.min(5, Math.round(Number(value.conviction) || 1)))
    const signature = await nearAiSignature(answer.chatId, answer.model)
    return {
      verdict,
      // The model may lower the rules' grade, never raise it.
      conviction: Math.min(conviction, setup.conviction),
      why: String(value.why ?? '').slice(0, 400),
      plain: String(value.plain ?? rulesOnly.plain).slice(0, 200),
      wouldChangeMind: String(value.wouldChangeMind ?? '').slice(0, 200),
      source: { provider: 'near-ai', model: answer.model, chatId: answer.chatId, signature },
    }
  } catch (e) {
    l.warn(`NEAR AI review failed, going on the rules alone: ${errMsg(e)}`)
    // Without the second opinion, the setup is graded one step lower.
    return { ...rulesOnly, conviction: Math.max(1, setup.conviction - 1), why: `No second opinion was available, so it is graded one step lower. ${rulesOnly.why}` }
  }
}
