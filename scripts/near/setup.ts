/**
 * Sets up ParallaxPay on NEAR mainnet, one step at a time. Every step that sends a transaction says
 * what it will do and waits for you to type "yes". Keys are written to .env.local and never printed.
 *
 *   npx tsx scripts/near/setup.ts status     what exists so far
 *   npx tsx scripts/near/setup.ts keys       make the owner key; prints the address to fund
 *   npx tsx scripts/near/setup.ts account    create parallaxpay.near from that funded address
 *   npx tsx scripts/near/setup.ts vault      create vault.parallaxpay.near, deploy the contract, initialise it
 *   npx tsx scripts/near/setup.ts agent      create agent.parallaxpay.near with a key that can only trade/seal/reveal/recover
 *   npx tsx scripts/near/setup.ts register   register the vault with Rhea and the token contracts
 *   npx tsx scripts/near/setup.ts routes     list NEAR and ZEC in the vault
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

async function confirm(what: string[]): Promise<void> {
  console.log('\nThis will send a mainnet transaction:')
  for (const line of what) console.log(`  - ${line}`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('Type "yes" to send it: ')).trim()
  rl.close()
  if (answer !== 'yes') {
    console.log('Nothing sent.')
    process.exit(0)
  }
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
  console.log(`Saved a new owner key to .env.local.\nSend about 5 NEAR to this address (it's a NEAR implicit account):\n\n  ${implicitId(kp)}\n`)
}

async function createOwner() {
  const kp = ownerKey()
  const imp = implicitId(kp)
  if (await accountExists(OWNER_ID)) return console.log(`${OWNER_ID} already exists.`)
  const balance = await nearBalance(imp)
  const keep = near(0.05)
  if (balance <= keep + near(1)) throw new Error(`The funding address holds ${fmt(balance)}; send about 5 NEAR first.`)
  const deposit = balance - keep
  await confirm([`create ${OWNER_ID} through the "near" registrar`, `move ${fmt(deposit)} into it`, `its key is the owner key in .env.local`])
  const signer = new Account(imp, provider, kp.toString() as KeyPairString)
  await send(signer, 'near', [actions.functionCall('create_account', { new_account_id: OWNER_ID, new_public_key: kp.getPublicKey().toString() }, 100n * 10n ** 12n, deposit)])
}

const owner = () => new Account(OWNER_ID, provider, ownerKey().toString() as KeyPairString)

async function createVault() {
  if (!existsSync(WASM)) throw new Error('Build the contract first: npm run near:build')
  if (await accountExists(VAULT_ID)) return console.log(`${VAULT_ID} already exists.`)
  const code = readFileSync(WASM)
  const funds = near(3.6)
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
    `create ${AGENT_ID} with 0.5 NEAR for gas`,
    `give it the owner key (full access, to rotate the server key later)`,
    `and a server key that can only call trade, seal, reveal and recover on ${VAULT_ID}, with no deposits`,
  ])
  await send(owner(), AGENT_ID, [
    actions.createAccount(),
    actions.transfer(near(0.5)),
    actions.addFullAccessKey(ownerKey().getPublicKey()),
    actions.addFunctionCallAccessKey(serverKey.getPublicKey(), VAULT_ID, ['trade', 'seal', 'reveal', 'recover']),
  ])
  saveKey('NEAR_AGENT_KEY', serverKey.toString())
  console.log('Saved the server key to .env.local as NEAR_AGENT_KEY. Copy it to the VM without printing it.')
}

async function register() {
  const tokens = [USDC_ID, ...COINS.map(c => c.id)]
  const missing: string[] = []
  for (const t of tokens) if (!(await storageRegistered(t, VAULT_ID))) missing.push(t)
  const onRhea = await storageRegistered(RHEA_ID, VAULT_ID)
  if (!missing.length && onRhea) return console.log('The vault is registered everywhere.')
  await confirm([
    ...(onRhea ? [] : [`open the vault's account on Rhea (${RHEA_ID}) with 0.1 NEAR of storage`]),
    ...missing.map(t => `register the vault with ${t} (0.00125 NEAR)`),
  ])
  if (!onRhea) await send(owner(), RHEA_ID, [actions.functionCall('storage_deposit', { account_id: VAULT_ID, registration_only: false }, 30n * 10n ** 12n, near(0.1))])
  for (const t of missing) await send(owner(), t, [actions.functionCall('storage_deposit', { account_id: VAULT_ID, registration_only: true }, 30n * 10n ** 12n, 1_250_000_000_000_000_000_000n)])
}

async function routes() {
  await confirm(COINS.map(c => `list ${c.symbol}: ${c.path.map(p => (p === USDC_ID ? 'USDC' : p)).join(' → ')} through Rhea pools ${c.pools.join(', ')}`))
  for (const c of COINS) await send(owner(), VAULT_ID, [actions.functionCall('set_route', { path: c.path, pools: c.pools }, 30n * 10n ** 12n, 1n)])
}

const steps: Record<string, () => Promise<void>> = { status, keys, account: createOwner, vault: createVault, agent: createAgent, register, routes }
const step = steps[process.argv[2] ?? 'status']
if (!step) {
  console.log(`Steps: ${Object.keys(steps).join(', ')}`)
  process.exit(1)
}
step().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
