/**
 * End-to-end test of the vault on NEAR testnet, against Rhea's real exchange contract
 * (ref-finance-101.testnet). It makes throwaway accounts from the testnet faucet, mints Rhea's test
 * USDC, opens a USDC/wNEAR pool, deploys near/vault, and runs the whole life of a member:
 * join → deposit → agent buy (plan sealed) → agent sell → plan opened → a buy that misses its minimum
 * → limits the vault must refuse → withdraw → leave. Every balance is checked against the vault's state.
 *
 *   npm run near:build && npx tsx scripts/near/testnet-e2e.ts
 *
 * Testnet only: the keys are throwaway and printed nowhere; the accounts hold faucet NEAR.
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Account, JsonRpcProvider, KeyPair, actions, type KeyPairString } from 'near-api-js'

const RPC = 'https://rpc.testnet.fastnear.com'
const REF = 'ref-finance-101.testnet'
const USDC = 'usdc.fakes.testnet'
const WNEAR = 'wrap.testnet'
const WASM = resolve('near/vault/target/near/parallaxpay_vault.wasm')
const NEAR = 10n ** 24n
const TGAS = 10n ** 12n
const provider = new JsonRpcProvider({ url: RPC })

type Outcome = { hash: string; ok: boolean; logs: string[]; value: unknown; failure: string | null }
const events = (o: Outcome) =>
  o.logs.filter(l => l.startsWith('EVENT_JSON:')).map(l => JSON.parse(l.slice(11)) as { standard: string; event: string; data: Record<string, unknown>[] }).filter(e => e.standard === 'parallaxpay')
const event = (o: Outcome, name: string) => events(o).find(e => e.event === name)?.data[0]

let step = 0
function check(cond: unknown, what: string): asserts cond {
  step++
  if (!cond) {
    console.error(`  ✗ ${step}. ${what}`)
    process.exit(1)
  }
  console.log(`  ✓ ${step}. ${what}`)
}

async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T
}

async function send(signer: Account, receiverId: string, list: ReturnType<typeof actions.functionCall>[]): Promise<Outcome> {
  const r = (await signer.signAndSendTransaction({ receiverId, actions: list, waitUntil: 'FINAL', throwOnFailure: false })) as unknown as {
    transaction: { hash: string }
    status: { SuccessValue?: string; Failure?: unknown }
    receipts_outcome: { outcome: { logs: string[]; status: { Failure?: unknown } } }[]
  }
  let value: unknown = null
  if (r.status.SuccessValue) {
    try {
      value = JSON.parse(Buffer.from(r.status.SuccessValue, 'base64').toString())
    } catch {
      value = null
    }
  }
  const failed = r.receipts_outcome.find(x => x.outcome.status.Failure)
  return {
    hash: r.transaction.hash,
    ok: !r.status.Failure,
    logs: r.receipts_outcome.flatMap(x => x.outcome.logs),
    value,
    failure: r.status.Failure ? JSON.stringify(r.status.Failure) : failed ? JSON.stringify(failed.outcome.status.Failure) : null,
  }
}

const call = (method: string, args: object, tgas = 50n, deposit = 0n) => actions.functionCall(method, args, tgas * TGAS, deposit)

async function exists(id: string) {
  try {
    await provider.viewAccount({ accountId: id })
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!existsSync(WASM)) throw new Error('Build the vault first: npm run near:build')
  const root = `pp-e2e-${Date.now().toString(36)}.testnet`
  const rootKey = KeyPair.fromRandom('ed25519')
  console.log(`Creating ${root} from the testnet faucet…`)
  const fr = await fetch('https://helper.nearprotocol.com/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newAccountId: root, newAccountPublicKey: rootKey.getPublicKey().toString() }),
  })
  if (!fr.ok) throw new Error(`Faucet refused: ${fr.status} ${await fr.text()}`)
  for (let i = 0; i < 20 && !(await exists(root)); i++) await new Promise(r => setTimeout(r, 1500))
  const owner = new Account(root, provider, rootKey.toString() as KeyPairString)
  const vaultId = `vault.${root}`
  const agentId = `agent.${root}`
  const aliceId = `alice.${root}`
  const agentKey = KeyPair.fromRandom('ed25519')
  const aliceKey = KeyPair.fromRandom('ed25519')

  console.log('\nAccounts')
  let o = await send(owner, vaultId, [
    actions.createAccount(),
    actions.transfer(4n * NEAR),
    actions.addFullAccessKey(rootKey.getPublicKey()),
    actions.deployContract(readFileSync(WASM)),
    call('new', { owner: root, agent: agentId, exchange: REF, usdc: USDC }, 30n),
  ])
  check(o.ok, `vault deployed and initialised (${o.hash})`)
  o = await send(owner, agentId, [actions.createAccount(), actions.transfer(NEAR / 2n), actions.addFunctionCallAccessKey(agentKey.getPublicKey(), vaultId, ['trade', 'seal', 'reveal', 'recover'])])
  check(o.ok, 'agent account with a key limited to trade/seal/reveal/recover on the vault')
  o = await send(owner, aliceId, [actions.createAccount(), actions.transfer(NEAR), actions.addFullAccessKey(aliceKey.getPublicKey())])
  check(o.ok, 'member account alice')
  const agent = new Account(agentId, provider, agentKey.toString() as KeyPairString)
  const alice = new Account(aliceId, provider, aliceKey.toString() as KeyPairString)

  console.log('\nA USDC/wNEAR pool on Rhea (testnet)')
  for (const id of [root, aliceId, vaultId]) {
    o = await send(owner, WNEAR, [call('storage_deposit', { account_id: id, registration_only: true }, 30n, 1_250_000_000_000_000_000_000n)])
    o = await send(owner, USDC, [call('storage_deposit', { account_id: id, registration_only: true }, 30n, 1_250_000_000_000_000_000_000n)])
  }
  o = await send(owner, USDC, [call('mint', { account_id: root, amount: '20000000' }, 30n)])
  check(o.ok, 'minted 20 test USDC to the owner')
  o = await send(owner, WNEAR, [call('near_deposit', {}, 30n, 2n * NEAR)])
  check(o.ok, 'wrapped 2 NEAR')
  o = await send(owner, REF, [call('storage_deposit', { account_id: root, registration_only: false }, 30n, NEAR / 10n), call('register_tokens', { token_ids: [USDC, WNEAR] }, 30n, 1n)])
  check(o.ok, 'owner registered on Rhea')
  o = await send(owner, USDC, [call('ft_transfer_call', { receiver_id: REF, amount: '8000000', msg: '' }, 100n, 1n)])
  check(o.ok, 'owner deposited 8 USDC into Rhea')
  o = await send(owner, WNEAR, [call('ft_transfer_call', { receiver_id: REF, amount: (2n * NEAR).toString(), msg: '' }, 100n, 1n)])
  check(o.ok, 'owner deposited 2 wNEAR into Rhea')
  o = await send(owner, REF, [call('add_simple_pool', { tokens: [USDC, WNEAR], fee: 30 }, 50n, NEAR / 10n)])
  const pool = Number(o.value)
  check(o.ok && Number.isInteger(pool), `opened pool #${pool}`)
  o = await send(owner, REF, [call('add_liquidity', { pool_id: pool, amounts: ['8000000', (2n * NEAR).toString()] }, 100n, NEAR / 100n)])
  check(o.ok, 'added 8 USDC + 2 wNEAR of liquidity (price 4 USDC per NEAR)')

  console.log('\nVault setup')
  o = await send(owner, REF, [call('storage_deposit', { account_id: vaultId, registration_only: false }, 30n, NEAR / 10n)])
  check(o.ok, 'vault registered on Rhea')
  o = await send(owner, vaultId, [call('register_tokens_on_exchange', { tokens: [USDC, WNEAR] }, 50n, 1n)])
  check(o.ok, 'vault registered USDC and wNEAR in its Rhea account')
  o = await send(owner, vaultId, [call('set_route', { path: [USDC, WNEAR], pools: [pool] }, 30n, 1n)])
  check(o.ok, 'owner listed NEAR through the new pool')

  console.log('\nA member')
  const rules = { autopilot: true, max_trade: '2000000', trades_per_day: 3, coins: [WNEAR], style: 2 }
  o = await send(alice, vaultId, [call('join', { rules }, 30n, 20_000_000_000_000_000_000_000n)])
  check(o.ok && event(o, 'join'), 'alice joined with autopilot, up to 2 USDC a buy')
  o = await send(owner, USDC, [call('mint', { account_id: aliceId, amount: '5000000' }, 30n)])
  o = await send(alice, USDC, [call('ft_transfer_call', { receiver_id: vaultId, amount: '3000000', msg: '' }, 100n, 1n)])
  let m = await view<{ balances: Record<string, string> }>(vaultId, 'get_member', { account_id: aliceId })
  check(o.ok && m.balances[USDC] === '3000000', 'alice deposited 3 USDC into the vault')

  console.log('\nThe agent trades')
  const quote = BigInt(await view<string>(REF, 'get_return', { pool_id: pool, token_in: USDC, amount_in: '1000000', token_out: WNEAR }))
  const salt = randomBytes(32)
  const plan = JSON.stringify({ v: 1, coin: 'NEAR', side: 'buy', stop: 3.8, target: 4.6, why: ['testnet end-to-end'] })
  const hash = createHash('sha256').update(Buffer.concat([salt, Buffer.from(plan)])).digest('hex')
  o = await send(agent, vaultId, [call('trade', { account_id: aliceId, token_in: USDC, token_out: WNEAR, amount_in: '1000000', min_out: ((quote * 99n) / 100n).toString(), seal: hash, call: null }, 300n)])
  const buy = event(o, 'trade_end')
  check(o.ok && buy?.outcome === 'filled', `agent bought wNEAR for 1 USDC, plan sealed (${o.hash})`)
  m = await view(vaultId, 'get_member', { account_id: aliceId })
  check(m.balances[USDC] === '2000000' && m.balances[WNEAR] === String(buy.amount_out), `vault credited exactly what Rhea returned: ${buy.amount_out} yocto-wNEAR`)
  const deposits = await view<Record<string, string>>(REF, 'get_deposits', { account_id: vaultId })
  check(Object.values(deposits).every(v => v === '0'), "nothing left behind in the vault's Rhea account")

  const back = BigInt(await view<string>(REF, 'get_return', { pool_id: pool, token_in: WNEAR, amount_in: String(buy.amount_out), token_out: USDC }))
  o = await send(agent, vaultId, [call('trade', { account_id: aliceId, token_in: WNEAR, token_out: USDC, amount_in: String(buy.amount_out), min_out: ((back * 99n) / 100n).toString(), seal: null, call: 0 }, 300n)])
  const sell = event(o, 'trade_end')
  check(o.ok && sell?.outcome === 'filled', `agent sold it back for ${Number(sell?.amount_out) / 1e6} USDC`)
  o = await send(agent, vaultId, [call('reveal', { call: 0, salt: salt.toString('hex'), plan }, 30n)])
  check(o.ok && event(o, 'reveal')?.plan === plan, 'agent opened the plan; the vault checked it against the seal')

  const greedy = BigInt(await view<string>(REF, 'get_return', { pool_id: pool, token_in: USDC, amount_in: '1000000', token_out: WNEAR })) * 2n
  m = await view(vaultId, 'get_member', { account_id: aliceId })
  const before = m.balances[USDC]
  o = await send(agent, vaultId, [call('trade', { account_id: aliceId, token_in: USDC, token_out: WNEAR, amount_in: '1000000', min_out: greedy.toString(), seal: null, call: null }, 300n)])
  m = await view(vaultId, 'get_member', { account_id: aliceId })
  check(o.ok && event(o, 'trade_end')?.outcome === 'refunded' && m.balances[USDC] === before, 'a buy that misses its minimum is refunded in full')

  console.log('\nWhat the vault refuses')
  o = await send(agent, vaultId, [call('trade', { account_id: aliceId, token_in: USDC, token_out: WNEAR, amount_in: '2500000', min_out: '1', seal: null, call: null }, 300n)])
  check(!o.ok && /largest trade/.test(o.failure ?? ''), 'the agent cannot buy more than the member allows')
  o = await send(owner, vaultId, [call('trade', { account_id: aliceId, token_in: USDC, token_out: WNEAR, amount_in: '1000000', min_out: '1', seal: null, call: null }, 300n, 1n)])
  check(!o.ok && /Only the member or the agent/.test(o.failure ?? ''), "the owner cannot trade a member's account")
  o = await send(alice, vaultId, [call('stop', {}, 10n)])
  o = await send(agent, vaultId, [call('trade', { account_id: aliceId, token_in: USDC, token_out: WNEAR, amount_in: '1000000', min_out: '1', seal: null, call: null }, 300n)])
  check(!o.ok && /Autopilot is off/.test(o.failure ?? ''), 'after stop, the agent cannot trade at all')

  console.log('\nLeaving')
  const walletBefore = BigInt(await view<string>(USDC, 'ft_balance_of', { account_id: aliceId }))
  o = await send(alice, vaultId, [call('withdraw', { token: USDC }, 50n, 1n)])
  const walletAfter = BigInt(await view<string>(USDC, 'ft_balance_of', { account_id: aliceId }))
  m = await view(vaultId, 'get_member', { account_id: aliceId })
  check(o.ok && walletAfter > walletBefore && Object.keys(m.balances).length === 0, `alice withdrew ${Number(walletAfter - walletBefore) / 1e6} USDC to her wallet`)
  o = await send(alice, vaultId, [call('leave', {}, 30n, 1n)])
  check(o.ok && (await view(vaultId, 'get_member', { account_id: aliceId })) === null, 'alice left and got her storage deposit back')
  const totals = await view<Record<string, string>>(vaultId, 'get_totals')
  check(Object.values(totals).every(v => v === '0'), 'the vault owes nobody anything')

  console.log(`\nAll ${step} checks passed. Vault: https://testnet.nearblocks.io/address/${vaultId}`)
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
