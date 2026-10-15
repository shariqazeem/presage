// One client for every model Presage asks: an OpenAI-compatible chat endpoint (the founder's
// CommonStack gateway in production). Models are named in env so they can change without code.

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

export const llmConfigured = () => Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY)

export const models = {
  oracle: () => (process.env.ORACLE_MODELS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  vision: () => process.env.VISION_MODEL ?? '',
  /** Tried in order when the first chart reader returns nothing; a chart read must not die on one model. */
  visionChain: () => [process.env.VISION_MODEL ?? '', ...(process.env.VISION_FALLBACK_MODELS ?? '').split(',')].map(s => s.trim()).filter(Boolean),
  compiler: () => process.env.COMPILER_MODEL ?? '',
}

/** Pull the first JSON object out of a model reply, tolerating code fences and stray prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON object in the model reply')
  return JSON.parse(body.slice(start, end + 1))
}

export async function chat(opts: {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  json?: boolean
}): Promise<string> {
  if (!llmConfigured()) throw new Error('No model is configured (LLM_BASE_URL and LLM_API_KEY)')
  if (!opts.model) throw new Error('No model named for this task')
  const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  })
  if (!res.ok) throw new Error(`${opts.model} answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = body.choices?.[0]?.message?.content
  if (!text) throw new Error(`${opts.model} returned no text`)
  return text
}

export async function chatJson<T>(opts: Parameters<typeof chat>[0]): Promise<T> {
  try {
    return extractJson(await chat({ ...opts, json: true })) as T
  } catch (e) {
    // Some gateways reject response_format for some models, and reasoning models can spend the whole
    // token budget thinking and return nothing. Ask once more without JSON mode and with more room.
    if (e instanceof Error && /response_format|json_object|returned no text|No JSON object/i.test(e.message)) {
      return extractJson(await chat({ ...opts, json: false, maxTokens: Math.max(1_200, (opts.maxTokens ?? 800) * 3) })) as T
    }
    throw e
  }
}
