// One client for every model Called asks: an OpenAI-compatible chat endpoint (the founder's
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

// The model key is shared (Sage uses it too) and the gateway only allows a couple of requests in
// flight per key, so each process keeps at most LLM_MAX_IN_FLIGHT of its own going and queues the
// rest. Someone waiting (a paid Oracle vote) goes ahead of background work (ST Quant's chart reads),
// and background work never takes the last slot.
const MAX_IN_FLIGHT = Math.max(1, Number(process.env.LLM_MAX_IN_FLIGHT ?? 2))
const MAX_BACKGROUND = Math.max(1, MAX_IN_FLIGHT - 1)
let inFlight = 0
let backgroundInFlight = 0
const waitingNow: (() => void)[] = []
const waitingBackground: (() => void)[] = []
const fits = (background: boolean) => inFlight < MAX_IN_FLIGHT && (!background || backgroundInFlight < MAX_BACKGROUND)
function pump() {
  for (;;) {
    if (waitingNow.length && fits(false)) {
      inFlight++
      waitingNow.shift()!()
    } else if (waitingBackground.length && fits(true)) {
      inFlight++
      backgroundInFlight++
      waitingBackground.shift()!()
    } else return
  }
}
async function slot<T>(background: boolean, fn: () => Promise<T>): Promise<T> {
  const queued = waitingNow.length + (background ? waitingBackground.length : 0)
  if (!queued && fits(background)) {
    inFlight++
    if (background) backgroundInFlight++
  } else {
    // pump() counts this request in before it wakes it.
    await new Promise<void>(r => (background ? waitingBackground : waitingNow).push(r))
  }
  try {
    return await fn()
  } finally {
    inFlight--
    if (background) backgroundInFlight--
    pump()
  }
}

export async function chat(opts: {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  json?: boolean
  /** Work nobody is waiting on; it queues behind everything else. */
  background?: boolean
}): Promise<string> {
  if (!llmConfigured()) throw new Error('No model is configured (LLM_BASE_URL and LLM_API_KEY)')
  if (!opts.model) throw new Error('No model named for this task')
  return slot(Boolean(opts.background), async () => {
    // One time budget per call, retries included, counted from when it gets its slot.
    const deadline = Date.now() + (opts.timeoutMs ?? 60_000)
    const send = () =>
      fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 800,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      })
    let res = await send()
    // The gateway sometimes answers 5xx for a moment, or 429 while the key's other requests (Sage's
    // included) fill its slots. Back off and try again while the budget allows.
    for (const wait of [2_000, 4_000, 6_000, 8_000]) {
      if (res.status < 500 && res.status !== 429) break
      if (deadline - Date.now() < wait + 3_000) break
      await res.body?.cancel().catch(() => {})
      await new Promise(r => setTimeout(r, wait))
      res = await send()
    }
    if (!res.ok) throw new Error(`${opts.model} answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = body.choices?.[0]?.message?.content
    if (!text) throw new Error(`${opts.model} returned no text`)
    return text
  })
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
