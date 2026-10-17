import { chatJson, llmConfigured, models } from '../llm'
import { ORACLE_ASSETS } from '../oracle-assets'
import { StrategySpec } from './schema'

/**
 * Plain English to a strategy spec. The model may only use the vocabulary below; anything else it must
 * list as missing and refuse, the same rule Sage follows: never invent a step.
 */
const VOCABULARY = `Allowed vocabulary (JSON). Timeframes: "15m" | "1h" | "4h" | "1d".

Levels (LevelRef):
- {"kind":"support","tf":TF,"type":"any"|"horizontal"|"trendline-rising"|"trendline-falling"|"pattern-apex"}: the nearest support of that type at or below price.
- {"kind":"patternSupport"}: support confirmed across the higher timeframes.
- {"kind":"firstRejection"}: the high of the biggest recent 4-hour pump candle, at most 30% up. Traders call this the first or last rejection point, the pump tip, or TP1.
- {"kind":"nearestResistance"}: the nearest level above price that rejected it before.
- {"kind":"recentLow","tf":TF,"bars":N} / {"kind":"recentHigh","tf":TF,"bars":N}.

Conditions (all must hold at once):
- {"kind":"mfi","tf":TF,"op":"<="|">=","value":0-100}
- {"kind":"mfiPercentile","tf":TF,"op":"<="|">=","value":0-1}  (0 = lowest of its last 100 readings)
- {"kind":"mfiTurningUp","tf":TF}
- {"kind":"nearLevel","level":LevelRef,"withinPct":0.1-10}
- {"kind":"trend","tf":TF,"dir":"up"|"down"}  (EMA20 vs EMA50)
- {"kind":"priceVsEma","tf":TF,"period":20|50|200,"op":"above"|"below"}
- {"kind":"bullishDivergence","tf":TF}
- {"kind":"volumeSpike","tf":TF,"mult":1.1-10}
- {"kind":"change","tf":TF,"bars":N,"op":"<="|">=","pct":number}
- {"kind":"minVolatility","tf":TF,"atrPct":number}

Spec:
{"v":1,"kind":"setup","side":"long","markets":[...],"when":[Condition,...],
 "entry":{"type":"market"} | {"type":"limit","level":LevelRef,"abovePct":0-3},
 "stop":{"type":"belowLevel","level":LevelRef,"pct":0-15} | {"type":"atr","tf":TF,"mult":0.5-6} | {"type":"pct","pct":0.3-25},
 "target":{"type":"level","level":LevelRef} | {"type":"r","multiple":0.5-10} | {"type":"pct","pct":0.3-100},
 "minRR":0.5-10,"fillWindowHours":1-72,"maxHoldHours":1-240,"cooldownHours":1-72}`

const SYSTEM = `You turn a trader's plain-English strategy into a Called strategy spec.
Called runs specs, never code, and seals every call they make on chain, so the spec must say exactly what the trader meant.

${VOCABULARY}

Rules:
- Use only the vocabulary above. Long setups only.
- If the strategy needs anything the vocabulary cannot express (RSI, MACD, Bollinger bands, news, funding, order books, shorting, leverage, position sizing, other coins' prices, time of day), do not approximate it: list each such thing in "missing" and return "spec": null.
- Where the trader leaves a detail out, choose a sensible value and say so in "assumptions" (for example, which timeframe "at support" means).
- Keep "markets" exactly as given by the user's market list.
Reply with JSON only: {"spec": Spec | null, "missing": [string], "assumptions": [string]}`

export type CompileResult =
  | { ok: true; spec: StrategySpec; assumptions: string[] }
  | { ok: false; missing: string[]; error?: string }

export async function compileStrategy(prompt: string, markets: string[]): Promise<CompileResult> {
  if (!llmConfigured() || !models.compiler()) {
    return { ok: false, missing: [], error: 'The strategy compiler is offline. Start from a template instead.' }
  }
  const known = new Set(ORACLE_ASSETS.map(a => a.market))
  const list = markets.filter(m => known.has(m)).slice(0, 8)
  if (!list.length) return { ok: false, missing: [], error: 'Pick at least one market.' }

  const ask = (extra?: string) =>
    chatJson<{ spec: unknown; missing?: string[]; assumptions?: string[] }>({
      model: models.compiler(),
      temperature: 0,
      maxTokens: 1500,
      timeoutMs: 60_000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Markets: ${JSON.stringify(list)}\nStrategy: ${prompt.slice(0, 2000)}${extra ? `\n\n${extra}` : ''}` },
      ],
    })

  let out = await ask()
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!out.spec) return { ok: false, missing: out.missing?.length ? out.missing : ['Called can’t express this strategy with the rules it runs yet.'] }
    const parsed = StrategySpec.safeParse({ ...(out.spec as object), markets: list })
    if (parsed.success) return { ok: true, spec: parsed.data, assumptions: out.assumptions ?? [] }
    out = await ask(`Your last spec was invalid: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}. Fix it, using only the vocabulary.`)
  }
  return { ok: false, missing: [], error: 'The compiler could not produce a valid spec. Try rewording, or start from a template.' }
}
