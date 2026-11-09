/**
 * Sets up ParallaxPay on NEAR mainnet, one step at a time. Every step that sends a transaction says
 * what it will do and waits for you to type "yes". Keys are written to .env.local and never printed.
 *
 *   npx tsx scripts/near/setup.ts status     what exists so far
 *   npx tsx scripts/near/setup.ts keys       make the owner key; prints the address to fund
 *   npx tsx scripts/near/setup.ts account    create parallaxpay.near from that funded address
 *   npx tsx scripts/near/setup.ts vault      create vault.parallaxpay.near, deploy the contract, initialise it
 *   npx tsx scripts/near/setup.ts agent      create agent.parallaxpay.near with a key that can only trade/seal/reveal/recover
 *   npx tsx scripts/near/setup.ts register   register the vault with Rhea and every coin's token contract
 *   npx tsx scripts/near/setup.ts routes     list every coin in lib/near/config.ts in the vault, ten to a transaction
 *   npx tsx scripts/near/setup.ts plan       what "all" would send and cost, and whether there's enough NEAR (sends nothing)
 *   npx tsx scripts/near/setup.ts all        account, vault, agent, register and routes in order, after one "yes" to the whole plan
 *   npx tsx scripts/near/setup.ts topup 0.45 move NEAR from the owner to the agent for gas
 */
import '../../engine/env'
import { createHash } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPair, actions, type KeyPairString } from 'near-api-js'
import { AGENT_ID, COINS, NEAR_RPCS, RHEA_ID, USDC_ID, VAULT_ID } from '../../lib/near/config'
import { accountExists, nearBalance, storageRegistered, view } from '../../lib/near/rpc'
import { fromUnits } from '../../lib/near/units'

const OWNER_ID = process.env.NEAR_OWNER ?? 'parallaxpay.near'
const ENV_FILE = resolve('.env.local')
const WASM = resolve('near/vault/target/near/parallaxpay_vault.wasm')
const NEAR = 10n ** 24n
const near = (n: number) => (BigInt(Math.round(n * 1000)) * NEAR) / 1000n
const fmt = (y: bigint) => `${fromUnits(y, 24).toFixed(4)} NEAR`
const provider = new FailoverRpcProvider(NEAR_RPCS.map(url => new JsonRpcProvider({ url })))

function saveKey(name: string, key: string) {
  appendFileSync(ENV_FILE, `\n${name}=${key}\n`)
  chmodSync(ENV_FILE, 0o600)
  process.env[name] = key
}

function ownerKey(): KeyPair {
  const k = process.env.NEAR_OWNER_KEY
  if (!k) throw new Error('No NEAR_OWNER_KEY in .env.local yet. Run the "keys" step first.')
  return KeyPair.fromString(k as KeyPairString)
}

const implicitId = (kp: KeyPair) => Buffer.from(kp.getPublicKey().data).toString('hex')

// NEAR charges about 0.001 NEAR per Tgas (Nov 2026) and sets aside each transaction's attached gas up
// front, returning what isn't used. The funding address keeps 0.1 NEAR so its one transaction fits.
const KEEP = near(0.1)
const CREATE_GAS = 50n * 10n ** 12n
// What the whole setup burns in network fees at that price: ~35 transactions, most of them small.
const FEES = near(0.3)

/** Set once "all" has shown the whole plan and you typed "yes" to it. */
let approved = false

async function ask(question: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(question)).trim()
  rl.close()
  if (answer !== 'yes') {
    console.log('Nothing sent.')
    process.exit(0)
  }
}

async function confirm(what: string[]): Promise<void> {
  console.log(approved ? '\nSending (you approved it above):' : '\nThis will send a mainnet transaction:')
  for (const line of what) console.log(`  - ${line}`)
  if (!approved) await ask('Type "yes" to send it: ')
}

async function send(signer: Account, receiverId: string, list: ReturnType<typeof actions.functionCall>[]) {
  const r = (await signer.signAndSendTransaction({ receiverId, actions: list, waitUntil: 'FINAL' })) as unknown as { transaction: { hash: string } }
  console.log(`Sent: https://nearblocks.io/txns/${r.transaction.hash}`)
}

async function status() {
  console.log(`Contract file: ${existsSync(WASM) ? `${WASM} (sha256 ${createHash('sha256').update(readFileSync(WASM)).digest('hex')})` : 'not built yet (npm run near:build)'}`)
  if (process.env.NEAR_OWNER_KEY) {
    const imp = implicitId(ownerKey())
    console.log(`Funding address: ${imp} ${(await accountExists(imp)) ? fmt(await nearBalance(imp)) : '(not funded yet)'}`)
  } else console.log('Owner key: not made yet')
  for (const id of [OWNER_ID, VAULT_ID, AGENT_ID]) console.log(`${id}: ${(await accountExists(id)) ? fmt(await nearBalance(id)) : 'not created'}`)
  if (await accountExists(VAULT_ID)) {
    try {
      console.log('Vault config:', JSON.stringify(await view(VAULT_ID, 'get_config'), null, 2))
    } catch {
      console.log('Vault: no contract yet')
    }
    for (const token of [RHEA_ID, USDC_ID, ...COINS.map(c => c.id)]) console.log(`  registered with ${token}: ${await storageRegistered(token, VAULT_ID)}`)
  }
  console.log(`Agent key in .env.local: ${process.env.NEAR_AGENT_KEY ? 'yes' : 'no'}`)
}

async function keys() {
  if (process.env.NEAR_OWNER_KEY) {
    console.log(`There's already an owner key. Its funding address: ${implicitId(ownerKey())}`)
    return
  }
  const kp = KeyPair.fromRandom('ed25519')
  saveKey('NEAR_OWNER_KEY', kp.toString())
  console.log(`Saved a new owner key to .env.local.\nSend about 4.5 NEAR to this address (it's a NEAR implicit account). About 3 of it is the vault's storage deposit, which stays in the vault's account rather than being spent:\n\n  ${implicitId(kp)}\n`)
}

async function createOwner() {
  const kp = ownerKey()
  const imp = implicitId(kp)
  if (await accountExists(OWNER_ID)) return console.log(`${OWNER_ID} already exists.`)
  const balance = await nearBalance(imp)
  if (balance <= KEEP + near(1)) throw new Error(`The funding address holds ${fmt(balance)}; send about 4.5 NEAR first.`)
  const deposit = balance - KEEP
  await confirm([`create ${OWNER_ID} through the "near" registrar`, `move ${fmt(deposit)} into it (${fmt(KEEP)} stays for this transaction's fee)`, `its key is the owner key in .env.local`])
  const signer = new Account(imp, provider, kp.toString() as KeyPairString)
  await send(signer, 'near', [actions.functionCall('create_account', { new_account_id: OWNER_ID, new_public_key: kp.getPublicKey().toString() }, CREATE_GAS, deposit)])
}

const owner = () => new Account(OWNER_ID, provider, ownerKey().toString() as KeyPairString)

// NEAR holds 1 NEAR per 100 kB an account stores. The code is most of it; 0.3 NEAR more covers the
// routes, sealed plans and trade records (members pay for their own records when they join).
const vaultFunds = (codeBytes: number) => near(Math.ceil((codeBytes / 100_000 + 0.3) * 100) / 100)

async function createVault() {
  if (!existsSync(WASM)) throw new Error('Build the contract first: npm run near:build')
  if (await accountExists(VAULT_ID)) return console.log(`${VAULT_ID} already exists.`)
  const code = readFileSync(WASM)
  const funds = vaultFunds(code.length)
  await confirm([
    `create ${VAULT_ID} with ${fmt(funds)} (the contract's storage takes about ${(code.length / 100_000).toFixed(2)} NEAR)`,
    `deploy near/vault (${code.length} bytes, sha256 ${createHash('sha256').update(code).digest('hex').slice(0, 16)}…)`,
    `initialise it: owner ${OWNER_ID}, agent ${AGENT_ID}, exchange ${RHEA_ID}, USDC ${USDC_ID.slice(0, 10)}…`,
    `the owner key can upgrade it (say so in the README until it is locked)`,
  ])
  await send(owner(), VAULT_ID, [
    actions.createAccount(),
    actions.transfer(funds),
    actions.addFullAccessKey(ownerKey().getPublicKey()),
    actions.deployContract(code),
    actions.functionCall('new', { owner: OWNER_ID, agent: AGENT_ID, exchange: RHEA_ID, usdc: USDC_ID }, 30n * 10n ** 12n, 0n),
  ])
}

async function createAgent() {
  if (await accountExists(AGENT_ID)) return console.log(`${AGENT_ID} already exists.`)
  const serverKey = KeyPair.fromRandom('ed25519')
  await confirm([
    `create ${AGENT_ID} with 0.3 NEAR for gas (a trade burns well under 0.01 NEAR)`,
    `give it the owner key (full access, to rotate the server key later)`,
    `and a server key that can only call trade, seal, reveal and recover on ${VAULT_ID}, with no deposits`,
  ])
  await send(owner(), AGENT_ID, [
    actions.createAccount(),
    actions.transfer(near(0.3)),
    actions.addFullAccessKey(ownerKey().getPublicKey()),
    actions.addFunctionCallAccessKey(serverKey.getPublicKey(), VAULT_ID, ['trade', 'seal', 'reveal', 'recover']),
  ])
  saveKey('NEAR_AGENT_KEY', serverKey.toString())
  console.log('Saved the server key to .env.local as NEAR_AGENT_KEY. Copy it to the VM without printing it.')
}

/** What a token contract asks to hold an account (NEP-145). Most ask 0.00125 NEAR; some ask more. */
async function storageMin(token: string): Promise<bigint> {
  try {
    const b = await view<{ min: string }>(token, 'storage_balance_bounds', {})
    if (BigInt(b.min) > 0n) return BigInt(b.min)
  } catch {
    // A token without the standard view gets the usual amount.
  }
  return 1_250_000_000_000_000_000_000n
}

async function register() {
  const tokens = [USDC_ID, ...COINS.map(c => c.id)]
  const missing: { token: string; deposit: bigint }[] = []
  for (const t of tokens) if (!(await storageRegistered(t, VAULT_ID))) missing.push({ token: t, deposit: await storageMin(t) })
  const onRhea = await storageRegistered(RHEA_ID, VAULT_ID)
  // Rhea takes deposits of tokens it has whitelisted; any other coin must be registered in the vault's
  // own Rhea account, which only the owner can ask the vault to do.
  const whitelist = new Set(await view<string[]>(RHEA_ID, 'get_whitelisted_tokens', {}))
  const inVault = onRhea ? new Set(Object.keys(await view<Record<string, string>>(RHEA_ID, 'get_deposits', { account_id: VAULT_ID }))) : new Set<string>()
  const unlisted = tokens.filter(t => !whitelist.has(t) && !inVault.has(t))
  if (!missing.length && onRhea && !unlisted.length) return console.log('The vault is registered everywhere.')
  const tokenTotal = missing.reduce((sum, m) => sum + m.deposit, 0n)
  await confirm([
    ...(onRhea ? [] : [`open the vault's account on Rhea (${RHEA_ID}) with 0.1 NEAR of storage`]),
    ...(missing.length ? [`register the vault with ${missing.length} token contracts, ${fmt(tokenTotal)} of storage in all, one transaction each`] : []),
    ...(unlisted.length ? [`register ${unlisted.length} coins Rhea hasn't whitelisted in the vault's Rhea account: ${unlisted.join(', ')}`] : []),
  ])
  if (!onRhea) await send(owner(), RHEA_ID, [actions.functionCall('storage_deposit', { account_id: VAULT_ID, registration_only: false }, 30n * 10n ** 12n, near(0.1))])
  for (const m of missing) await send(owner(), m.token, [actions.functionCall('storage_deposit', { account_id: VAULT_ID, registration_only: true }, 30n * 10n ** 12n, m.deposit)])
  if (unlisted.length) {
    await send(owner(), VAULT_ID, [actions.functionCall('register_tokens_on_exchange', { tokens: unlisted }, 100n * 10n ** 12n, 1n)])
    const now = new Set(Object.keys(await view<Record<string, string>>(RHEA_ID, 'get_deposits', { account_id: VAULT_ID })))
    const still = unlisted.filter(t => !now.has(t))
    if (still.length) throw new Error(`Rhea didn't register ${still.join(', ')} in the vault's account. Run "register" again.`)
  }
}

async function routes() {
  const config = await view<{ routes: { path: string[] }[] }>(VAULT_ID, 'get_config', {}).catch(() => null)
  const listed = new Set((config?.routes ?? []).map(r => r.path.at(-1)))
  const todo = COINS.filter(c => !listed.has(c.id))
  if (!todo.length) return console.log(`All ${COINS.length} coins are listed.`)
  await confirm(todo.map(c => `list ${c.symbol}: ${c.path.map(p => (p === USDC_ID ? 'USDC' : p)).join(' → ')} through Rhea pools ${c.pools.join(', ')}`))
  // Ten routes to a transaction keeps each well under NEAR's 300 Tgas.
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10)
    await send(
      owner(),
      VAULT_ID,
      batch.map(c => actions.functionCall('set_route', { path: c.path, pools: c.pools }, 25n * 10n ** 12n, 1n)),
    )
  }
}

/**
 * Moves NEAR from the owner to the agent for gas. NEAR holds 0.3 NEAR of the agent's balance while each
 * 300 Tgas trade runs, and the agent only opens a trade with 0.1 NEAR more spare to close it later.
 *   npx tsx scripts/near/setup.ts topup [NEAR]   (0.45 by default)
 */
async function topup() {
  const amount = near(Number(process.argv[3] ?? '0.45'))
  if (!(amount > 0n)) throw new Error('Say how much NEAR, e.g. topup 0.45')
  const ownerBalance = await nearBalance(OWNER_ID)
  if (ownerBalance < amount + near(0.2)) throw new Error(`${OWNER_ID} holds ${fmt(ownerBalance)}; it keeps 0.2 NEAR for its own transactions.`)
  const agentBalance = await nearBalance(AGENT_ID)
  await confirm([
    `move ${fmt(amount)} from ${OWNER_ID} to ${AGENT_ID} for gas`,
    `the agent then holds ${fmt(agentBalance + amount)}; ${OWNER_ID} keeps ${fmt(ownerBalance - amount)}`,
  ])
  await send(owner(), AGENT_ID, [actions.transfer(amount)])
}

/** Everything "all" would still send, what it costs, and what's there to pay for it. Sends nothing. */
async function plan(): Promise<{ lines: string[]; need: bigint; have: bigint }> {
  const imp = implicitId(ownerKey())
  const funding = (await accountExists(imp)) ? await nearBalance(imp) : 0n
  const ownerExists = await accountExists(OWNER_ID)
  const vaultExists = await accountExists(VAULT_ID)
  const have = (ownerExists ? await nearBalance(OWNER_ID) : 0n) + (!ownerExists && funding > KEEP ? funding - KEEP : 0n)
  const lines: string[] = []
  let need = 0n
  if (!ownerExists) lines.push(`create ${OWNER_ID} and move ${fmt(funding - KEEP)} into it from the funding address`)
  if (!vaultExists) {
    const bytes = readFileSync(WASM).length
    lines.push(`create ${VAULT_ID} with ${fmt(vaultFunds(bytes))}, deploy the contract (${bytes} bytes) and initialise it`)
    need += vaultFunds(bytes)
  }
  if (!(await accountExists(AGENT_ID))) {
    lines.push(`create ${AGENT_ID} with 0.3 NEAR for gas, plus a server key that can only trade, seal, reveal and recover`)
    need += near(0.3)
  }
  const onRhea = vaultExists && (await storageRegistered(RHEA_ID, VAULT_ID))
  if (!onRhea) {
    lines.push(`open the vault's account on Rhea with 0.1 NEAR of storage`)
    need += near(0.1)
  }
  const tokens = [USDC_ID, ...COINS.map(c => c.id)]
  let storage = 0n
  let count = 0
  for (const t of tokens) {
    if (vaultExists && (await storageRegistered(t, VAULT_ID))) continue
    storage += await storageMin(t)
    count++
  }
  if (count) {
    lines.push(`register the vault with ${count} token contracts, ${fmt(storage)} of storage in all`)
    need += storage
  }
  const whitelist = new Set(await view<string[]>(RHEA_ID, 'get_whitelisted_tokens', {}))
  const inVault = onRhea ? new Set(Object.keys(await view<Record<string, string>>(RHEA_ID, 'get_deposits', { account_id: VAULT_ID }))) : new Set<string>()
  const unlisted = tokens.filter(t => !whitelist.has(t) && !inVault.has(t))
  if (unlisted.length) lines.push(`register ${unlisted.join(', ')} in the vault's Rhea account (Rhea hasn't whitelisted it)`)
  const config = vaultExists ? await view<{ routes: { path: string[] }[] }>(VAULT_ID, 'get_config', {}).catch(() => null) : null
  const listed = new Set((config?.routes ?? []).map(r => r.path.at(-1)))
  const todo = COINS.filter(c => !listed.has(c.id)).length
  if (todo) lines.push(`list ${todo} coins in the vault, ten to a transaction`)
  if (lines.length) {
    lines.push(`network fees: about ${fmt(FEES)} at today's gas price`)
    need += FEES
  }
  return { lines, need, have }
}

async function showPlan() {
  const p = await plan()
  if (!p.lines.length) return console.log('Everything is set up already.')
  console.log('\nWhat "all" would send on NEAR mainnet:')
  for (const line of p.lines) console.log(`  - ${line}`)
  console.log(`\nIt needs about ${fmt(p.need)}; there is ${fmt(p.have)} to pay for it.`)
}

/** Every mainnet step in order, after one "yes" to the whole plan. */
async function all() {
  const p = await plan()
  if (!p.lines.length) return console.log('Everything is set up already.')
  console.log('\nThis will set up ParallaxPay on NEAR mainnet:')
  for (const line of p.lines) console.log(`  - ${line}`)
  console.log(`\nIt needs about ${fmt(p.need)}; there is ${fmt(p.have)} to pay for it. About 3.6 NEAR of it is storage deposits that stay in the accounts.`)
  if (p.need > p.have) throw new Error(`Not enough NEAR: send about ${fmt(p.need - p.have + near(0.1))} more to the funding address first. Nothing was sent.`)
  await ask('Type "yes" to send all of it: ')
  approved = true
  await createOwner()
  if (!(await accountExists(OWNER_ID))) throw new Error(`${OWNER_ID} wasn't created, so nothing else was sent. Check the transaction above.`)
  await createVault()
  await createAgent()
  await register()
  await routes()
  console.log('\nDone. Where things stand:\n')
  await status()
}

const steps: Record<string, () => Promise<void>> = { status, keys, plan: showPlan, account: createOwner, vault: createVault, agent: createAgent, register, routes, all, topup }
const step = steps[process.argv[2] ?? 'status']
if (!step) {
  console.log(`Steps: ${Object.keys(steps).join(', ')}`)
  process.exit(1)
}
step().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
