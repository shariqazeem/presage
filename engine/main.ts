import './env'
import { eq } from 'drizzle-orm'
import { formatEther } from 'viem'
import { isMainnet } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { indexOnce } from './indexer'
import { errMsg, log } from './log'
import { answerPaid } from './oracle'
import { refundUndelivered, resolveDue } from './resolver'
import { scanOnce } from './stquant-agent'
import { runCreatorAgents } from './creators'
import { startTelegram } from './telegram'
import { keepTestnetFeedFresh } from './testnet'
import { runner, runnerBalance } from './tx'

const l = log('engine')

/** Run `fn` now and then every `ms`, never overlapping itself, never letting one failure stop the loop. */
function every(name: string, ms: number, fn: () => Promise<void>) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await fn()
    } catch (e) {
      l.error(`${name}: ${errMsg(e)}`)
    } finally {
      running = false
    }
  }
  void tick()
  setInterval(tick, ms)
}

function houseAgentId(slug: string): number | null {
  const row = getDb().select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.slug, slug)).get()
  return row?.id ?? null
}

async function main() {
  getDb()
  const oracleId = houseAgentId('oracle')
  const stquantId = houseAgentId('st-quant')
  const balance = await runnerBalance()
  l.info(`engine up on ${isMainnet ? 'Metis Andromeda' : 'Metis Sepolia'}`, {
    runner: runner.address,
    balance: formatEther(balance),
    oracle: oracleId,
    stquant: stquantId,
  })

  every('indexer', 5_000, indexOnce)
  every('resolver', 60_000, resolveDue)
  every('refunds', 5 * 60_000, refundUndelivered)
  if (oracleId != null) every('oracle', 2_000, () => answerPaid(oracleId))
  else l.warn('no Oracle agent registered yet: run scripts/register-house-agents.ts')
  if (stquantId != null && process.env.STQUANT_ENABLED !== '0') every('stquant', 5 * 60_000, () => scanOnce(stquantId))
  every('creators', 5 * 60_000, runCreatorAgents)
  if (!isMainnet) every('testnet-feed', 6 * 3_600_000, keepTestnetFeedFresh)
  every('gas', 30 * 60_000, async () => {
    const b = await runnerBalance()
    if (b < 2n * 10n ** 17n) l.error(`runner is low on gas: ${formatEther(b)} METIS left at ${runner.address}`)
  })
  startTelegram()
}

main().catch(e => {
  l.error(`engine failed to start: ${errMsg(e)}`)
  process.exit(1)
})
