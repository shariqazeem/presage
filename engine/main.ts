import './env'
import { eq } from 'drizzle-orm'
import { formatEther } from 'viem'
import { isMainnet } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { indexOnce } from './indexer'
import { errMsg, log } from './log'
import { answerPaid, scheduledCalls } from './oracle'
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

/** Run `fn` `delaySec` after every `minutes`-minute boundary (UTC), never overlapping itself. */
function onCandleClose(name: string, minutes: number, delaySec: number, fn: () => Promise<void>) {
  let running = false
  const schedule = () => {
    const period = minutes * 60_000
    const wait = period - (Date.now() % period) + delaySec * 1000
    setTimeout(async () => {
      if (!running) {
        running = true
        try {
          await fn()
        } catch (e) {
          l.error(`${name}: ${errMsg(e)}`)
        } finally {
          running = false
        }
      }
      schedule()
    }, wait)
  }
  schedule()
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
  // The Oracle's own calls every 4 hours, two minutes past the hour, so its record never stands still.
  if (oracleId != null && process.env.ORACLE_SCHEDULE !== 'off') onCandleClose('oracle-schedule', 240, 120, () => scheduledCalls(oracleId))
  else l.warn('no Oracle agent registered yet: run scripts/register-house-agents.ts')
  // ST Quant reads 15-minute candles, so it scans once per candle, a minute after each one closes.
  if (stquantId != null && process.env.STQUANT_ENABLED !== '0') onCandleClose('stquant', 15, 60, () => scanOnce(stquantId))
  every('creators', 5 * 60_000, runCreatorAgents)
  if (!isMainnet) every('testnet-feed', 6 * 3_600_000, keepTestnetFeedFresh)
  // A heartbeat the website reads (/api/health), so a stopped engine is visible before deadlines pass.
  every('heartbeat', 30_000, async () => {
    const value = JSON.stringify({ at: Math.floor(Date.now() / 1000), runner: runner.address, balance: formatEther(await runnerBalance()) })
    getDb()
      .insert(schema.kv)
      .values({ key: 'engine:heartbeat', value })
      .onConflictDoUpdate({ target: schema.kv.key, set: { value } })
      .run()
  })
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
