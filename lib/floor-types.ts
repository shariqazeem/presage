/** Shapes shared by the engine (which writes them) and the pages (which show them). */

export type EventKind =
  | 'scan' // {phase:'start'|'done', markets, candidates?, sealed?, ms?}
  | 'candidate' // {symbol, route, score, rr}
  | 'chart_read' // {symbol, verdict, conviction, why, chart?}
  | 'sealed' // {callId, chainCallId, symbol?, kind}
  | 'resolved' // {callId, chainCallId, symbol, outcome, result, kind}
  | 'forfeited' // {callId, chainCallId}
  | 'answered' // {callId, symbol, horizon, direction, confidence, paid:boolean}
  | 'skipped' // {symbol, why}

export type AgentEvent = {
  id: number
  agentId: number
  agentSlug: string
  agentName: string
  kind: EventKind
  at: number
  data: Record<string, unknown>
  /** True when a symbol was hidden because the call is still sealed and the viewer is not a subscriber. */
  masked: boolean
}

export type RadarState = 'quiet' | 'watching' | 'close' | 'firing'

export type RadarRow = {
  symbol: string | null
  /** Where the candles come from, so the row can link somewhere. */
  source: 'binance' | 'geckoterminal'
  ref: string
  price: number
  mfi15: number | null
  mfi15Pct: number | null
  mfi1h: number | null
  mfi1hPct: number | null
  atrPct: number
  /** Distance above the nearest support at or below price, in percent. */
  supportDistPct: number | null
  supportKind: string | null
  score: number
  state: RadarState
  /** The first thing stopping an entry, in the rules' own words. */
  blocker: string | null
  /** A creator agent's own rules against this market, as a checklist. ST Quant's come from the MFI fields. */
  checks?: { label: string; ok: boolean; saw: string }[]
  at: number
}

export type AgentStatus = {
  state: 'scanning' | 'reading' | 'sealed' | 'waiting' | 'answering' | 'idle' | 'offline'
  line: string
  at: number
}
