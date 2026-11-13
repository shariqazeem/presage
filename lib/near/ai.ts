import { extractJson, type ChatMessage } from '../llm'

/**
 * NEAR AI Cloud: an OpenAI-compatible chat API whose open models run inside TEEs. After an answer,
 * the enclave signs `sha256(request):sha256(response)` with a key its attestation report vouches
 * for, so anyone can check the agent's reasoning came from that model and wasn't edited.
 */

const BASE = process.env.NEAR_AI_BASE_URL ?? 'https://cloud-api.near.ai/v1'

/** An open model with vision that NEAR AI Cloud serves from a TEE. */
export const nearAiModel = () => process.env.NEAR_AI_MODEL ?? 'z-ai/glm-5.3-flash'

export const nearAiConfigured = () => Boolean(process.env.NEAR_AI_API_KEY)

const headers = () => ({ authorization: `Bearer ${process.env.NEAR_AI_API_KEY}`, 'content-type': 'application/json' })

export type NearAiAnswer = { text: string; chatId: string; model: string }

type Completion = { id: string; model?: string; choices: { message: { content: string | null }; finish_reason?: string }[] }

/**
 * One answer from the model. The default model reasons before it answers, and when its token budget runs
 * out mid-thought it answers nothing, so an empty reply is asked again with reasoning turned down.
 * `quick` skips the reasoning from the start: a chat reply in about a second instead of five.
 */
export async function nearAiChat(opts: {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  quick?: boolean
}): Promise<NearAiAnswer> {
  const model = opts.model ?? nearAiModel()
  const call = async (quick: boolean): Promise<Completion> => {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.maxTokens ?? 700,
        stream: false,
        ...(quick ? { reasoning_effort: 'low' } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    })
    if (!res.ok) throw new Error(`NEAR AI ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as Completion
  }
  const said = (c: Completion) => c.choices[0]?.message?.content ?? ''
  let body: Completion | null = null
  try {
    body = await call(Boolean(opts.quick))
  } catch (e) {
    // A long think that ran out of time gets one quick answer instead.
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    if (opts.quick || !timedOut) throw e
  }
  if (!body || (!said(body).trim() && !opts.quick)) body = await call(true)
  const text = said(body)
  if (!text.trim()) throw new Error(`NEAR AI returned an empty answer (${body.choices[0]?.finish_reason ?? 'no reason given'})`)
  return { text, chatId: body.id, model: body.model ?? model }
}

export async function nearAiChatJson<T>(opts: Parameters<typeof nearAiChat>[0]): Promise<{ value: T; answer: NearAiAnswer }> {
  const answer = await nearAiChat(opts)
  return { value: extractJson(answer.text) as T, answer }
}

export type NearAiSignature = { text: string; signature: string; signing_address: string; signing_algo: string }

/** The enclave's signature over one answer. It can take a moment to be ready, so this retries briefly. */
export async function nearAiSignature(chatId: string, model: string): Promise<NearAiSignature | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`, {
        headers: headers(),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return (await res.json()) as NearAiSignature
    } catch {
      // try again
    }
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
  }
  return null
}
