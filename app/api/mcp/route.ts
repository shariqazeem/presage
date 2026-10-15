import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { getAgent, getCall, listAgents, recentCalls } from '@/lib/server/records'
import { HttpError, oracleAnswer, quoteOracleCall, verifyPayment } from '@/lib/server/x402'
import { ORACLE_ASSETS } from '@/lib/oracle-assets'

export const dynamic = 'force-dynamic'

/**
 * Presage over MCP (Streamable HTTP, stateless, JSON responses). Agents can read every record and buy
 * Oracle calls over x402 with their own wallet: oracle_quote → pay on chain → oracle_answer.
 */
const PROTOCOL = '2025-06-18'
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const TOOLS = [
  {
    name: 'list_agents',
    description: 'Every Presage agent with its public record: calls sealed, wins, losses, forfeits, hit rate and average result.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_agent',
    description: 'One agent and its recent calls. Sealed calls show only their fingerprint until they are revealed.',
    inputSchema: { type: 'object', properties: { slug: { type: 'string', description: 'Agent slug, e.g. "oracle" or "st-quant"' } }, required: ['slug'] },
  },
  {
    name: 'get_call',
    description: 'One call with its seal and reveal transactions, outcome, and everything needed to re-check it.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
  },
  {
    name: 'oracle_quote',
    description:
      'Start a paid Oracle call. Returns x402 payment requirements (scheme "escrow" on eip155:1088), a requestId and a secret. Pay with PresageMarket.payForCall from your own wallet, then call oracle_answer.',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: `One of ${ORACLE_ASSETS.length} coins, e.g. BTC, ETH, METIS` },
        horizon: { type: 'string', enum: ['1h', '4h', '24h'] },
      },
      required: ['asset', 'horizon'],
    },
  },
  {
    name: 'oracle_answer',
    description: 'After paying, get the sealed answer: direction, confidence, reasons and the Metis transaction that sealed it.',
    inputSchema: {
      type: 'object',
      properties: { requestId: { type: 'string' }, txHash: { type: 'string' }, secret: { type: 'string' } },
      required: ['requestId', 'txHash', 'secret'],
    },
  },
]

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'list_agents':
      return listAgents()
    case 'get_agent': {
      const a = getAgent(String(args.slug ?? ''))
      if (!a) throw new HttpError(404, 'No such agent')
      return { agent: a, calls: recentCalls({ agentId: a.id, limit: 25 }) }
    }
    case 'get_call': {
      const c = getCall(Number(args.id))
      if (!c) throw new HttpError(404, 'No such call')
      return { ...c, receipt: `${site()}/calls/${c.id}` }
    }
    case 'oracle_quote':
      return quoteOracleCall({ asset: String(args.asset ?? ''), horizon: String(args.horizon ?? ''), resource: `${site()}/api/oracle/call` })
    case 'oracle_answer': {
      await verifyPayment(String(args.requestId) as Hex, String(args.secret), String(args.txHash) as Hex)
      const deadline = Date.now() + 45_000
      let answer = oracleAnswer(String(args.requestId) as Hex, String(args.secret))
      while (!answer.call && answer.status !== 'failed' && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1_000))
        answer = oracleAnswer(String(args.requestId) as Hex, String(args.secret))
      }
      return answer
    }
    default:
      throw new HttpError(404, `Unknown tool ${name}`)
  }
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }

async function handle(msg: Rpc) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0' as const, id: msg.id ?? null, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0' as const, id: msg.id ?? null, error: { code, message } })
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'presage', title: 'Presage', version: '0.1.0' },
        instructions:
          'Presage publishes AI trading calls that are sealed on Metis Andromeda before their outcome and scored after. Read records with list_agents, get_agent and get_call. Buy an Oracle call with oracle_quote, pay PresageMarket.payForCall from your own wallet, then oracle_answer. Not financial advice.',
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: TOOLS })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      try {
        const data = await callTool(name, (msg.params?.arguments as Record<string, unknown>) ?? {})
        return ok({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }], structuredContent: { result: data } })
      } catch (e) {
        return ok({ content: [{ type: 'text', text: e instanceof Error ? e.message : 'Tool failed' }], isError: true })
      }
    }
    default:
      return msg.id === undefined ? null : fail(-32601, `Method not found: ${msg.method}`)
  }
}

export async function POST(req: NextRequest) {
  let body: Rpc | Rpc[]
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }
  const batch = Array.isArray(body)
  const messages: Rpc[] = Array.isArray(body) ? body : [body]
  const results = (await Promise.all(messages.map(handle))).filter(r => r !== null)
  // Notifications only: acknowledge with no body, per Streamable HTTP.
  if (!results.length) return new NextResponse(null, { status: 202 })
  return NextResponse.json(batch ? results : results[0], { headers: { 'mcp-protocol-version': PROTOCOL } })
}

export async function GET() {
  // Stateless server: no server-initiated stream.
  return new NextResponse('Presage MCP: POST JSON-RPC to this URL.', { status: 405, headers: { allow: 'POST' } })
}
