import { and, eq, gt, inArray, isNotNull } from 'drizzle-orm'
import { keccak256, stringToBytes } from 'viem'
import { presageAgentsAbi } from '../lib/abi/PresageAgents'
import type { SetupPayload } from '../lib/calls/payload'
import { publicClient } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { loadFrames } from '../lib/market/frames'
import { ORACLE_ASSETS } from '../lib/oracle-assets'
import { StrategySpec } from '../lib/spec/schema'
import { contracts, publishCall } from './calls'
import { emit, setRadar } from './events'
import { plainCondition } from '../lib/spec/describe'
import type { RadarRow } from '../lib/floor-types'
import { errMsg, log } from './log'
import { evaluate } from './spec-eval'

const l = log('creators')
const MAX_OPEN_PER_AGENT = 6
const REVEAL_GRACE_SEC = 2 * 3600

/** Spec hashes read from PresageAgents, so the runner only ever runs the strategy that was sealed. */
const sealedHash = new Map<number, string>()

async function onChainSpecHash(agentId: number): Promise<string> {
  const hit = sealedHash.get(agentId)
  if (hit) return hit
  const a = await publicClient.readContract({
    address: contracts().agents,
    abi: presageAgentsAbi,
    functionName: 'getAgent',
    args: [BigInt(agentId)],
  })
  sealedHash.set(agentId, a.specHash.toLowerCase())
  return a.specHash.toLowerCase()
}

/** Run every live creator agent once: check its spec on each of its markets, seal what fires. */
export async function runCreatorAgents(): Promise<void> {
  const db = getDb()
  const live = await db
    .select()
    .from(schema.agents)
    .where(and(eq(schema.agents.house, false), eq(schema.agents.retired, false), isNotNull(schema.agents.registeredTx)))

  for (const agent of live) {
    try {
      // Refuse to run anything but the sealed strategy, whatever the database says.
      if (keccak256(stringToBytes(agent.specJson)).toLowerCase() !== (await onChainSpecHash(agent.id))) {
        l.error(`agent ${agent.id}: stored spec does not match the sealed spec hash; not running it`)
        continue
      }
      const spec = StrategySpec.parse(JSON.parse(agent.specJson))
      const open = await db
        .select({ id: schema.calls.id })
        .from(schema.calls)
        .where(and(eq(schema.calls.agentId, agent.id), inArray(schema.calls.status, ['pending', 'sealed'])))
      let room = MAX_OPEN_PER_AGENT - open.length
      const rows: RadarRow[] = []

      for (const market of spec.markets) {
        if (room <= 0) break
        const symbol = ORACLE_ASSETS.find(a => a.market === market)?.symbol ?? market
        const since = Math.floor(Date.now() / 1000) - spec.cooldownHours * 3600
        const recent = await db
          .select({ id: schema.calls.id })
          .from(schema.calls)
          .where(and(eq(schema.calls.agentId, agent.id), eq(schema.calls.asset, symbol), gt(schema.calls.issuedAt, since)))
          .limit(1)
        if (recent.length) continue

        const frames = await loadFrames({ symbol, source: 'binance', market })
        const { signal, checks, blocked } = evaluate(spec, frames)
        const price = frames.m15.at(-1)!.c
        rows.push({
          symbol,
          source: 'binance',
          ref: `binance:${market}`,
          price: Number(price.toPrecision(8)),
          mfi15: null,
          mfi15Pct: null,
          mfi1h: null,
          mfi1hPct: null,
          atrPct: 0,
          supportDistPct: null,
          supportKind: null,
          score: checks.filter(c => c.ok).length,
          state: signal ? 'firing' : checks.every(c => c.ok) ? 'close' : checks.some(c => c.ok) ? 'watching' : 'quiet',
          blocker: signal ? null : (blocked ?? checks.find(c => !c.ok)?.saw ?? null),
          checks: spec.when.map((c, i) => ({ label: plainCondition(c), ok: checks[i].ok, saw: checks[i].saw })),
          at: Math.floor(Date.now() / 1000),
        })
        if (!signal) continue

        const now = Math.floor(Date.now() / 1000)
        const fillBy = signal.entry.type === 'market' ? now : now + spec.fillWindowHours * 3600
        const payload: SetupPayload = {
          v: 1,
          rules: 'presage/setup-v1',
          agent: agent.id,
          asset: { symbol, source: 'binance', market },
          side: 'long',
          entry: signal.entry,
          stop: signal.stop,
          target: signal.target,
          issuedAt: now,
          priceAtIssue: Number(frames.m15.at(-1)!.c.toPrecision(8)),
          fillBy,
          maxHoldSec: spec.maxHoldHours * 3600,
          why: signal.why.slice(0, 8),
        }
        const row = await publishCall({ payload, revealBy: fillBy + spec.maxHoldHours * 3600 + REVEAL_GRACE_SEC })
        emit(agent.id, 'sealed', { callId: row.id, chainCallId: row.chainCallId, symbol, kind: 'setup', route: 'spec' })
        l.info(`agent ${agent.id} sealed ${symbol}`, { call: row.id, entry: signal.entry, stop: signal.stop, target: signal.target })
        room--
      }
      setRadar(agent.id, rows)
    } catch (e) {
      l.warn(`agent ${agent.id}: ${errMsg(e)}`)
    }
  }
}
