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

export async function nearAiChat(opts: { messages: ChatMessage[]; model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number }): Promise<NearAiAnswer> {
  const model = opts.model ?? nearAiModel()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, messages: opts.messages, temperature: opts.temperature ?? 0.1, max_tokens: opts.maxTokens ?? 700, stream: false }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  })
  if (!res.ok) throw new Error(`NEAR AI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { id: string; model?: string; choices: { message: { content: string | null } }[] }
  const text = body.choices[0]?.message?.content ?? ''
  if (!text.trim()) throw new Error('NEAR AI returned an empty answer')
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
