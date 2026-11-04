import '../env'
import { getDb, schema } from '../../lib/db'
import { AGENT_ID, VAULT_ID } from '../../lib/near/config'
import { nearAiConfigured, nearAiModel } from '../../lib/near/ai'
import { errMsg, log } from '../log'
import { checkMarkets, manageExits, recoverStuck, syncMembers } from './desk'
import { agentConfigured } from './signer'

const l = log('near')

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

/** Run `fn` `delaySec` after every 15-minute candle closes (UTC), never overlapping itself. */
function onQuarterHour(name: string, delaySec: number, fn: () => Promise<void>) {
  let running = false
  const schedule = () => {
    const period = 15 * 60_000
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
    }, period - (Date.now() % period) + delaySec * 1000)
  }
  schedule()
}

getDb()
l.info('ParallaxPay agent up on NEAR', {
  vault: VAULT_ID,
  agent: AGENT_ID,
  trading: agentConfigured() ? 'on' : 'off (no NEAR_AGENT_KEY): reading markets only',
  analyst: nearAiConfigured() ? nearAiModel() : 'rules only (no NEAR_AI_API_KEY)',
})

// A heartbeat the website shows at /api/health, so a stopped agent is visible to anyone.
every('heartbeat', 60_000, async () => {
  const value = JSON.stringify({ at: Math.floor(Date.now() / 1000), trading: agentConfigured(), analyst: nearAiConfigured() ? nearAiModel() : 'rules only' })
  getDb().insert(schema.kv).values({ key: 'near:heartbeat', value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run()
})
every('members', 60_000, syncMembers)
void checkMarkets().catch(e => l.error(`markets: ${errMsg(e)}`))
onQuarterHour('markets', 20, checkMarkets)
every('exits', 2 * 60_000, manageExits)
every('recover', 2 * 60_000, recoverStuck)
